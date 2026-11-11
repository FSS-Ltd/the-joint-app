import { ConflictException } from "@nestjs/common";
import type { AuthContext } from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
import { readLondonClock } from "../../london-clock.js";
import { findScopedBudget } from "../budgets/budget-projection.js";
import { resolveReportScope } from "./report-scope.js";

export async function observeSpending(
  tx: Prisma.TransactionClient,
  context: AuthContext,
) {
  const clock = await readLondonClock(tx);
  // Preserve the database's remaining time on the API observer's clock.
  const nextChangeAt =
    Date.now() + (clock.nextMonthAt.getTime() - clock.now.getTime());
  const month = clock.today.slice(0, 7);
  const scope = await resolveReportScope(tx, context);
  const ids = scope.map((account) => account.id);
  const revisions = ids.length
    ? await tx.$queryRaw<{ accountId: string; revision: string }[]>`
    SELECT "accountId", revision FROM app.spending_ledger_revisions(${ids}::uuid[]) ORDER BY "accountId"`
    : [];
  const budget = await findScopedBudget(tx, context, month, ids);
  const coverage = ids.length
    ? await tx.accountMonthCoverage.findMany({
        where: {
          householdId: context.householdId,
          accountId: { in: ids },
          month: new Date(`${month}-01T00:00:00.000Z`),
        },
        orderBy: { accountId: "asc" },
        select: {
          accountId: true,
          complete: true,
          version: true,
          updatedAt: true,
        },
      })
    : [];
  const [authority] = await tx.$queryRaw<
    { valid: boolean }[]
  >`SELECT app.scope_is_valid() AS valid`;
  if (!authority?.valid || revisions.length !== ids.length) {
    throw new ConflictException({ error: { code: "SCOPE_CHANGED" } });
  }
  return {
    status: { month, scope, revisions, budget, coverage },
    nextChangeAt,
  };
}
