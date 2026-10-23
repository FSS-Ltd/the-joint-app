import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  accountSchema,
  type AuthContext,
  type AccountResponse,
} from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
import type { ScopedDatabase } from "@joint/database/scoped";
import { isLiabilityKind } from "@joint/domain";
import { RequestReplay } from "../households/request-replay.js";
import { hashToken, type IdentityVault } from "../identity/identity-vault.js";
import { readAccount } from "./account-projection.js";
import {
  lockActor,
  lockOwnedAccount,
  recordChange,
  requireMfa,
  requireVersion,
} from "./account-transaction.js";

export interface CreateAccountInput {
  label: string;
  kind: Prisma.AccountCreateInput["kind"];
  currency: "GBP";
  liquidity: Prisma.AccountCreateInput["liquidity"];
}
export interface ValuationInput {
  money: { amountMinor: string; currency: "GBP" };
  asOfDate: string;
}

export class AccountMutations {
  private readonly replay: RequestReplay;
  constructor(
    private readonly database: ScopedDatabase,
    vault: IdentityVault,
  ) {
    this.replay = new RequestReplay(vault);
  }

  private execute(
    context: AuthContext,
    action: (tx: Prisma.TransactionClient) => Promise<AccountResponse>,
  ): Promise<AccountResponse> {
    return this.database.withScope(context, async (tx) => {
      await lockActor(tx, context);
      return action(tx);
    });
  }
  create(
    context: AuthContext,
    input: CreateAccountInput,
    key: string,
  ): Promise<AccountResponse> {
    requireMfa(context);
    const route = `accounts:${context.householdId}`;
    const digest = hashToken(JSON.stringify(input));
    return this.execute(context, async (tx) => {
      const previous = await this.replay.read(
        tx,
        context.userId,
        route,
        key,
        digest,
        accountSchema,
      );
      if (previous) return readAccount(tx, context, previous.id);
      const account = await tx.account.create({
        data: {
          ...input,
          householdId: context.householdId,
          creatorUserId: context.userId,
          creatorMembershipId: context.membershipId,
          owners: {
            create: {
              userId: context.userId,
              membershipId: context.membershipId,
            },
          },
        },
      });
      await recordChange(tx, context, "ACCOUNT_CREATED");
      const result = await readAccount(tx, context, account.id);
      await this.replay.save(tx, context.userId, route, key, digest, result);
      return result;
    });
  }
  patch(
    context: AuthContext,
    accountId: string,
    input: { label: string; liquidity: "AVAILABLE" | "RESTRICTED" | "LOCKED" },
    version: number,
  ): Promise<AccountResponse> {
    return this.execute(context, async (tx) => {
      await lockOwnedAccount(tx, context, accountId);
      const account = await tx.account.findUnique({ where: { id: accountId } });
      if (!account) throw new NotFoundException();
      requireVersion(account.version, version);
      await tx.account.update({
        where: { id: accountId },
        data: { ...input, version: { increment: 1 } },
      });
      await recordChange(tx, context, "ACCOUNT_UPDATED");
      return readAccount(tx, context, accountId);
    });
  }
  value(
    context: AuthContext,
    accountId: string,
    input: ValuationInput,
    version: number,
    key: string,
  ): Promise<AccountResponse> {
    const route = `valuation:${accountId}`;
    const digest = hashToken(JSON.stringify(input));
    return this.execute(context, async (tx) => {
      await lockOwnedAccount(tx, context, accountId);
      const previous = await this.replay.read(
        tx,
        context.userId,
        route,
        key,
        digest,
        accountSchema,
      );
      if (previous) return readAccount(tx, context, accountId);
      const account = await tx.account.findUnique({ where: { id: accountId } });
      if (!account) throw new NotFoundException();
      requireVersion(account.version, version);
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((entry) => entry.type === type)?.value;
      const today = `${part("year")}-${part("month")}-${part("day")}`;
      if (
        input.asOfDate > today ||
        (isLiabilityKind(account.kind) && BigInt(input.money.amountMinor) < 0n)
      )
        throw new BadRequestException();
      await tx.balanceSnapshot.create({
        data: {
          householdId: context.householdId,
          accountId,
          authorMembershipId: context.membershipId,
          amountMinor: BigInt(input.money.amountMinor),
          currency: input.money.currency,
          asOfDate: new Date(`${input.asOfDate}T00:00:00.000Z`),
        },
      });
      await tx.account.update({
        where: { id: accountId },
        data: { version: { increment: 1 } },
      });
      await recordChange(tx, context, "ACCOUNT_VALUED");
      const result = await readAccount(tx, context, accountId);
      await this.replay.save(tx, context.userId, route, key, digest, result);
      return result;
    });
  }
}
