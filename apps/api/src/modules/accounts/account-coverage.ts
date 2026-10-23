import { BadRequestException } from "@nestjs/common";
import { accountCoverageSchema, type AuthContext } from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import { londonToday } from "@joint/domain/transactions";
import {
  lockActor,
  lockOwnedAccount,
  recordChange,
  requireVersion,
} from "./account-transaction.js";

export class AccountCoverage {
  constructor(private readonly database: ScopedDatabase) {}
  put(
    context: AuthContext,
    accountId: string,
    month: string,
    complete: boolean,
    version: number,
  ) {
    if (complete && month >= londonToday().slice(0, 7))
      throw new BadRequestException({
        error: { code: "OPEN_COVERAGE_PERIOD" },
      });
    return this.database.withScope(context, async (tx) => {
      await lockActor(tx, context);
      await lockOwnedAccount(tx, context, accountId);
      const date = new Date(`${month}-01T00:00:00.000Z`);
      const where = { accountId_month: { accountId, month: date } };
      const current = await tx.accountMonthCoverage.findUnique({ where });
      requireVersion(current?.version ?? 0, version);
      const row = await tx.accountMonthCoverage.upsert({
        where,
        create: {
          householdId: context.householdId,
          accountId,
          month: date,
          complete,
          authorMembershipId: context.membershipId,
        },
        update: {
          complete,
          authorMembershipId: context.membershipId,
          version: { increment: 1 },
        },
      });
      await tx.coverageRevision.create({
        data: {
          householdId: context.householdId,
          accountId,
          month: date,
          complete,
          actorMembershipId: context.membershipId,
          version: row.version,
        },
        select: { id: true },
      });
      await tx.account.update({
        where: { id: accountId },
        data: { version: { increment: 1 } },
        select: { id: true },
      });
      await recordChange(tx, context, "ACCOUNT_COVERAGE_UPDATED");
      return accountCoverageSchema.parse({
        version: row.version,
        complete: row.complete,
        reviewedAt: row.updatedAt.toISOString(),
      });
    });
  }
}
