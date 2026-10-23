import { ConflictException } from "@nestjs/common";
import type { AuthContext, budgetUpsertSchema } from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import {
  lockActor,
  recordChange,
  requireVersion,
} from "../accounts/account-transaction.js";
import { resolveReportScope, scopeHash } from "../reports/report-scope.js";
import { budgetInclude, projectBudget } from "./budget-projection.js";

type Input = ReturnType<typeof budgetUpsertSchema.parse>;
export class BudgetMutations {
  constructor(private readonly database: ScopedDatabase) {}
  put(context: AuthContext, month: string, input: Input, version: number) {
    return this.database.withScope(context, async (tx) => {
      await lockActor(tx, context);
      const accounts = await resolveReportScope(tx, context, input.accountIds);
      const hash = scopeHash(accounts.map((account) => account.id));
      let scope = await tx.budgetScope.findUnique({
        where: {
          householdId_scopeHash: {
            householdId: context.householdId,
            scopeHash: hash,
          },
        },
      });
      if (!scope) {
        scope = await tx.budgetScope.create({
          data: {
            householdId: context.householdId,
            scopeHash: hash,
            creatorMembershipId: context.membershipId,
          },
        });
        const scopeId = scope.id;
        await tx.budgetScopeAccount.createMany({
          data: accounts.map((account) => ({
            householdId: context.householdId,
            scopeId,
            accountId: account.id,
          })),
        });
        const [published] = await tx.$queryRaw<
          { published: boolean }[]
        >`SELECT app.publish_budget_scope(${scope.id}::uuid) AS published`;
        if (!published?.published)
          throw new ConflictException({ error: { code: "SCOPE_CHANGED" } });
      }
      const date = new Date(`${month}-01T00:00:00.000Z`);
      const previous = await tx.budget.findUnique({
        where: { scopeId_month: { scopeId: scope.id, month: date } },
      });
      requireVersion(previous?.version ?? 0, version);
      const budget = previous
        ? await tx.budget.update({
            where: { id: previous.id },
            data: { version: { increment: 1 } },
          })
        : await tx.budget.create({
            data: {
              householdId: context.householdId,
              scopeId: scope.id,
              month: date,
              creatorMembershipId: context.membershipId,
            },
          });
      await tx.budgetLine.deleteMany({ where: { budgetId: budget.id } });
      if (input.lines.length)
        await tx.budgetLine.createMany({
          data: input.lines.map((line) => ({
            householdId: context.householdId,
            budgetId: budget.id,
            category: line.category ?? "",
            amountMinor: BigInt(line.limit.amountMinor),
          })),
        });
      await tx.budgetRevision.create({
        data: {
          householdId: context.householdId,
          budgetId: budget.id,
          actorMembershipId: context.membershipId,
          version: budget.version,
          data: input,
        },
        select: { id: true },
      });
      await recordChange(tx, context, "BUDGET_UPDATED");
      return projectBudget(
        await tx.budget.findUniqueOrThrow({
          where: { id: budget.id },
          include: budgetInclude,
        }),
      );
    });
  }
}
