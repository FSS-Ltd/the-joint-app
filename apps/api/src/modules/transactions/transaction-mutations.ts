import { BadRequestException, ConflictException } from "@nestjs/common";
import {
  transactionSchema,
  type AuthContext,
  type transactionCreateSchema,
  type transactionPatchSchema,
} from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
import type { ScopedDatabase } from "@joint/database/scoped";
import {
  transactionFingerprint,
  transactionSourceHash,
} from "@joint/domain/csv";
import { londonToday } from "@joint/domain/transactions";
import { randomUUID } from "node:crypto";
import {
  lockActor,
  lockOwnedAccount,
  recordChange,
  requireVersion,
} from "../accounts/account-transaction.js";
import { RequestReplay } from "../households/request-replay.js";
import { hashToken, type IdentityVault } from "../identity/identity-vault.js";
import {
  lockTransactionAccount,
  readTransaction,
} from "./transaction-projection.js";

type CreateInput = ReturnType<typeof transactionCreateSchema.parse>;
type PatchInput = ReturnType<typeof transactionPatchSchema.parse>;
async function requireStableAccount(
  tx: Prisma.TransactionClient,
  accountId: string,
): Promise<void> {
  const active = await tx.importBatch.findFirst({
    where: {
      accountId,
      OR: [
        { state: "COMMITTING" },
        { state: "FAILED", committedRows: { gt: 0 } },
      ],
    },
    select: { id: true },
  });
  if (active) throw new ConflictException({ error: { code: "IMPORT_BUSY" } });
}
export class TransactionMutations {
  private readonly replay: RequestReplay;
  constructor(
    private readonly database: ScopedDatabase,
    vault: IdentityVault,
  ) {
    this.replay = new RequestReplay(vault);
  }
  create(context: AuthContext, input: CreateInput, key: string) {
    if (input.bookedDate > londonToday()) throw new BadRequestException();
    const route = `transaction:${input.accountId}`,
      digest = hashToken(JSON.stringify(input));
    return this.database.withScope(context, async (tx) => {
      await lockActor(tx, context);
      await lockOwnedAccount(tx, context, input.accountId);
      const previous = await this.replay.read(
        tx,
        context.userId,
        route,
        key,
        digest,
        transactionSchema,
      );
      if (previous) return readTransaction(tx, context, previous.id);
      await requireStableAccount(tx, input.accountId);
      const row = await tx.transaction.create({
        data: {
          householdId: context.householdId,
          accountId: input.accountId,
          sourceNamespace: "MANUAL",
          sourceId: randomUUID(),
          sourceHash: transactionSourceHash(input),
          fingerprint: transactionFingerprint(input),
          amountMinor: BigInt(input.money.amountMinor),
          currency: input.money.currency,
          bookedDate: new Date(`${input.bookedDate}T00:00:00.000Z`),
          description: input.description,
        },
        select: { id: true },
      });
      await tx.transactionRevision.create({
        data: {
          householdId: context.householdId,
          accountId: input.accountId,
          transactionId: row.id,
          actorMembershipId: context.membershipId,
          version: 1,
          kind: "CREATED",
          data: input,
        },
        select: { id: true },
      });
      await recordChange(tx, context, "TRANSACTION_CREATED");
      await tx.account.update({
        where: { id: input.accountId },
        data: { version: { increment: 1 } },
        select: { id: true },
      });
      const result = await readTransaction(tx, context, row.id);
      await this.replay.save(tx, context.userId, route, key, digest, result);
      return result;
    });
  }
  patch(context: AuthContext, id: string, input: PatchInput, version: number) {
    if (input.bookedDate > londonToday()) throw new BadRequestException();
    return this.database.withScope(context, async (tx) => {
      await lockActor(tx, context);
      const current = await lockTransactionAccount(tx, context, id, true);
      requireVersion(current.version, version);
      await requireStableAccount(tx, current.accountId);
      if (current.sourceNamespace !== "MANUAL")
        throw new BadRequestException({ error: { code: "SOURCE_IMMUTABLE" } });
      await tx.transaction.update({
        where: { id },
        data: {
          amountMinor: BigInt(input.money.amountMinor),
          bookedDate: new Date(`${input.bookedDate}T00:00:00.000Z`),
          description: input.description,
          fingerprint: transactionFingerprint(input),
          version: { increment: 1 },
        },
        select: { id: true },
      });
      await tx.transactionRevision.create({
        data: {
          householdId: context.householdId,
          accountId: current.accountId,
          transactionId: id,
          actorMembershipId: context.membershipId,
          version: current.version + 1,
          kind: "MANUAL_CORRECTION",
          data: input,
        },
        select: { id: true },
      });
      await recordChange(tx, context, "TRANSACTION_CORRECTED");
      await tx.account.update({
        where: { id: current.accountId },
        data: { version: { increment: 1 } },
        select: { id: true },
      });
      return readTransaction(tx, context, id);
    });
  }
}
