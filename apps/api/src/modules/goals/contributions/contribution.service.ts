import {
  contributionArchiveListSchema,
  contributionArchiveRawListSchema,
  contributionPageSchema,
  idempotencyKeySchema,
  type AuthContext,
  type ContributionArchiveList,
  type ContributionBudgetView,
  type ContributionCapacity,
  type ContributionPage,
  type ContributionPlanWrite,
} from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import type {
  ArchiveDatabase,
  OwnerArchiveContext,
} from "@joint/database/archive";
import type { Prisma } from "@joint/database/client";
import { validateInput } from "../../../http-input.js";
import { requireFreshMfa } from "../../accounts/account-transaction.js";
import type { IdentityVault } from "../../identity/identity-vault.js";
import { GoalCursors } from "../goal-cursors.js";
import { prepareGoalQuery } from "../goal-queries.js";
import {
  ContributionCursors,
  contributionBinding,
  type ContributionOperation,
} from "./contribution-cursors.js";
import { safeContributionQuery } from "./contribution-errors.js";
import {
  contributionView,
  readContributionPage,
  type ContributionSelection,
} from "./contribution-queries.js";
import { ContributionWrites } from "./contribution-writes.js";

function selection(
  budgetId: string | null,
  goalId?: string,
): ContributionSelection {
  return {
    budgetId:
      budgetId === null
        ? null
        : validateInput(idempotencyKeySchema, budgetId).toLowerCase(),
    goalId:
      goalId === undefined
        ? null
        : validateInput(idempotencyKeySchema, goalId).toLowerCase(),
  };
}
export class ContributionService {
  private readonly writes: ContributionWrites;
  private readonly cursors: ContributionCursors;
  private readonly lists: GoalCursors;
  constructor(
    private readonly database: Pick<ScopedDatabase, "withScope">,
    private readonly archive: Pick<ArchiveDatabase, "withScope">,
    vault: IdentityVault,
  ) {
    this.writes = new ContributionWrites(database, vault);
    this.cursors = new ContributionCursors(vault);
    this.lists = new GoalCursors(vault);
  }
  writeCapacity(
    context: AuthContext,
    version: number,
    input: ContributionCapacity,
    key: string,
  ): Promise<ContributionBudgetView> {
    return this.writes.capacity(context, version, input, key);
  }
  writePlan(
    context: AuthContext,
    goalId: string,
    version: number,
    input: ContributionPlanWrite,
    key: string,
  ): Promise<ContributionBudgetView> {
    return this.writes.plan(context, goalId, version, input, key);
  }
  async read(
    context: AuthContext,
    goalId?: string,
  ): Promise<ContributionBudgetView> {
    return (await this.page(context, selection(null, goalId), false, "read"))
      .view;
  }
  history(
    context: AuthContext,
    goalId?: string,
    cursor?: string,
  ): Promise<ContributionPage> {
    return this.page(
      context,
      selection(null, goalId),
      false,
      "history",
      cursor,
    );
  }
  export(
    context: AuthContext,
    goalId?: string,
    cursor?: string,
  ): Promise<ContributionPage> {
    return this.page(context, selection(null, goalId), false, "export", cursor);
  }
  async readArchive(
    context: OwnerArchiveContext,
    budgetId: string,
    goalId?: string,
  ): Promise<ContributionBudgetView> {
    return (await this.page(context, selection(budgetId, goalId), true, "read"))
      .view;
  }
  historyArchive(
    context: OwnerArchiveContext,
    budgetId: string,
    goalId?: string,
    cursor?: string,
  ): Promise<ContributionPage> {
    return this.page(
      context,
      selection(budgetId, goalId),
      true,
      "history",
      cursor,
    );
  }
  exportArchive(
    context: OwnerArchiveContext,
    budgetId: string,
    goalId?: string,
    cursor?: string,
  ): Promise<ContributionPage> {
    return this.page(
      context,
      selection(budgetId, goalId),
      true,
      "export",
      cursor,
    );
  }
  async listArchive(
    context: OwnerArchiveContext,
    cursor?: string,
  ): Promise<ContributionArchiveList> {
    const binding = contributionBinding(context, selection(null), true, "list"),
      after = this.lists.id(cursor, binding);
    const result = await safeContributionQuery(() =>
      this.archive.withScope(context, async (tx) => {
        await prepareGoalQuery(tx);
        const [row] = await tx.$queryRaw<
          { data: unknown }[]
        >`SELECT app.list_archived_contribution_budgets(${after ?? null}::uuid) AS data`;
        return contributionArchiveRawListSchema.parse(row?.data);
      }),
    );
    return contributionArchiveListSchema.parse({
      budgets: result.budgets,
      nextCursor:
        result.nextAfterId === null
          ? null
          : this.lists.seal(result.nextAfterId, binding),
    });
  }
  private async page(
    context: AuthContext | OwnerArchiveContext,
    selected: ContributionSelection,
    archived: boolean,
    operation: ContributionOperation,
    cursor?: string,
  ): Promise<ContributionPage> {
    if (operation === "export") requireFreshMfa(context);
    const binding = contributionBinding(context, selected, archived, operation),
      after = this.cursors.read(cursor, binding);
    const query = (tx: Prisma.TransactionClient) =>
      readContributionPage(
        tx,
        { ...selected, budgetId: after?.budgetId ?? selected.budgetId },
        operation === "read" ? 2147483647 : (after?.version ?? 0),
      );
    const result = await safeContributionQuery(() => {
      if (archived) return this.archive.withScope(context, query);
      if (!("membershipId" in context))
        throw new Error("Active contributions require household scope");
      return this.database.withScope(context, query);
    });
    if (operation === "export") requireFreshMfa(context);
    return contributionPageSchema.parse({
      view: contributionView(result.view),
      history: result.history,
      nextCursor:
        result.nextAfterVersion === null
          ? null
          : this.cursors.seal(
              result.view.budget.id,
              result.nextAfterVersion,
              binding,
            ),
    });
  }
}
