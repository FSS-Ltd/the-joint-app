import {
  contributionBudgetViewSchema,
  contributionCapacitySchema,
  contributionPlanWriteSchema,
  contributionRawViewSchema,
  idempotencyKeySchema,
  quotedVersionSchema,
  type AuthContext,
  type ContributionCapacity,
  type ContributionPlanWrite,
  type ContributionBudgetView,
} from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import { validateInput } from "../../../http-input.js";
import { RequestReplay } from "../../households/request-replay.js";
import {
  hashToken,
  type IdentityVault,
} from "../../identity/identity-vault.js";
import {
  authorizeContributionWrite,
  contributionView,
} from "./contribution-queries.js";
import { safeContributionQuery } from "./contribution-errors.js";

export class ContributionWrites {
  private readonly replay: RequestReplay;
  constructor(
    private readonly database: Pick<ScopedDatabase, "withScope">,
    vault: IdentityVault,
  ) {
    this.replay = new RequestReplay(vault);
  }
  async capacity(
    context: AuthContext,
    version: number,
    input: ContributionCapacity,
    key: string,
  ): Promise<ContributionBudgetView> {
    return this.write(
      context,
      null,
      version,
      validateInput(contributionCapacitySchema, input),
      key,
    );
  }
  async plan(
    context: AuthContext,
    goalId: string,
    version: number,
    input: ContributionPlanWrite,
    key: string,
  ): Promise<ContributionBudgetView> {
    const id = validateInput(idempotencyKeySchema, goalId).toLowerCase();
    return this.write(
      context,
      id,
      version,
      validateInput(contributionPlanWriteSchema, input),
      key,
    );
  }
  private write(
    context: AuthContext,
    goalId: string | null,
    version: number,
    data: ContributionCapacity | ContributionPlanWrite,
    key: string,
  ): Promise<ContributionBudgetView> {
    validateInput(quotedVersionSchema, `"${version}"`);
    const replayKey = validateInput(idempotencyKeySchema, key).toLowerCase(),
      route = `contributions:${context.householdId}:${goalId ?? "capacity"}`,
      digest = hashToken(JSON.stringify({ version, data }));
    return safeContributionQuery(() =>
      this.database.withScope(context, async (tx) => {
        await authorizeContributionWrite(tx, goalId);
        const previous = await this.replay.read(
          tx,
          context.userId,
          route,
          replayKey,
          digest,
          contributionBudgetViewSchema,
        );
        if (previous) {
          await authorizeContributionWrite(tx, goalId);
          return previous;
        }
        const [row] =
          goalId === null
            ? await tx.$queryRaw<
                { data: unknown }[]
              >`SELECT app.write_contribution_capacity(${version}::integer,${JSON.stringify(data)}::jsonb) AS data`
            : await tx.$queryRaw<
                { data: unknown }[]
              >`SELECT app.write_contribution_plan(${goalId}::uuid,${version}::integer,${JSON.stringify(data)}::jsonb) AS data`;
        const result = contributionView(
          contributionRawViewSchema.parse(row?.data),
        );
        await this.replay.save(
          tx,
          context.userId,
          route,
          replayKey,
          digest,
          result,
        );
        await authorizeContributionWrite(tx, goalId);
        return result;
      }),
    );
  }
}
