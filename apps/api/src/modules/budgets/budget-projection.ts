import {
  budgetSchema,
  type AuthContext,
  type BudgetResponse,
} from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
import { scopeHash } from "../reports/report-scope.js";
export const budgetInclude = {
  lines: { orderBy: { category: "asc" } },
  scope: { include: { accounts: { orderBy: { accountId: "asc" } } } },
} satisfies Prisma.BudgetInclude;
export type BudgetRow = Prisma.BudgetGetPayload<{
  include: typeof budgetInclude;
}>;
export function projectBudget(row: BudgetRow): BudgetResponse {
  return budgetSchema.parse({
    id: row.id,
    scopeId: row.scopeId,
    month: row.month.toISOString().slice(0, 7),
    accountIds: row.scope.accounts.map((a) => a.accountId),
    currency: row.currency,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    lines: row.lines.map((line) => ({
      category: line.category === "" ? null : line.category,
      limit: { amountMinor: line.amountMinor.toString(), currency: "GBP" },
    })),
  });
}
export async function findScopedBudget(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  month: string,
  accountIds: readonly string[],
): Promise<BudgetResponse | null> {
  if (accountIds.length === 0) return null;
  const row = await tx.budget.findFirst({
    where: {
      householdId: context.householdId,
      month: new Date(`${month}-01T00:00:00.000Z`),
      scope: { scopeHash: scopeHash(accountIds), ready: true },
    },
    include: budgetInclude,
  });
  return row ? projectBudget(row) : null;
}
