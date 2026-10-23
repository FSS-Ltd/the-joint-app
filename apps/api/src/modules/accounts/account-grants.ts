import { NotFoundException } from "@nestjs/common";
import type {
  AuthContext,
  AccountResponse,
  GrantLevel,
} from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import { readAccount } from "./account-projection.js";
import {
  lockActor,
  lockOwnedAccount,
  recordChange,
  requireFreshMfa,
  requireVersion,
  widensGrant,
} from "./account-transaction.js";

export class AccountGrants {
  constructor(private readonly database: ScopedDatabase) {}
  set(
    context: AuthContext,
    accountId: string,
    membershipId: string,
    level: GrantLevel,
    version: number,
  ): Promise<AccountResponse> {
    return this.database.withScope(context, async (tx) => {
      await lockActor(tx, context);
      await lockOwnedAccount(tx, context, accountId);
      const member = await tx.membership.findFirst({
        where: {
          id: membershipId,
          householdId: context.householdId,
          status: "ACTIVE",
          user: { status: "ACTIVE" },
        },
      });
      if (!member || member.userId === context.userId)
        throw new NotFoundException();
      const where = { accountId_membershipId: { accountId, membershipId } };
      const existing = await tx.accountGrant.findUnique({ where });
      requireVersion(existing?.version ?? 0, version);
      if (widensGrant(existing?.level ?? "NONE", level))
        requireFreshMfa(context);
      await tx.accountGrant.upsert({
        where,
        create: {
          householdId: context.householdId,
          accountId,
          membershipId,
          level,
        },
        update: { level, version: { increment: 1 } },
      });
      await tx.account.update({
        where: { id: accountId },
        data: { version: { increment: 1 } },
      });
      await tx.membership.updateMany({
        where: { householdId: context.householdId, status: "ACTIVE" },
        data: { grantVersion: { increment: 1 } },
      });
      const current = await tx.membership.findUniqueOrThrow({
        where: { id: context.membershipId },
        select: { grantVersion: true },
      });
      const next = { ...context, grantVersion: current.grantVersion };
      await tx.$queryRaw`SELECT set_config('joint.grant_version', ${String(next.grantVersion)}, true)`;
      await recordChange(tx, next, "ACCOUNT_GRANT_CHANGED");
      return readAccount(tx, next, accountId);
    });
  }
}
