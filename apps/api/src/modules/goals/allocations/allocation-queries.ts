import {
  goalAllocationWriteSchema,
  goalAllocationRawPageSchema,
  type GoalAllocationWrite,
  type GoalAllocationRawPage,
} from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
import { validateInput } from "../../../http-input.js";
import { prepareGoalQuery } from "../goal-queries.js";

export function canonicalAllocationWrite(
  input: GoalAllocationWrite,
): GoalAllocationWrite {
  const data = validateInput(goalAllocationWriteSchema, input);
  return {
    accountIds: data.accountIds.map((id) => id.toLowerCase()).sort(),
    sourceVersions: data.sourceVersions
      .map((source) => ({
        ...source,
        accountId: source.accountId.toLowerCase(),
      }))
      .sort((a, b) => a.accountId.localeCompare(b.accountId)),
    allocations: data.allocations
      .map((entry) => ({
        ...entry,
        accountId: entry.accountId.toLowerCase(),
        valuationId: entry.valuationId.toLowerCase(),
      }))
      .sort((a, b) => a.accountId.localeCompare(b.accountId)),
  };
}
export async function readAllocationPage(
  tx: Prisma.TransactionClient,
  id: string,
  accountIds: readonly string[],
  after: GoalAllocationRawPage["nextAfter"],
): Promise<GoalAllocationRawPage> {
  await prepareGoalQuery(tx);
  const [row] = await tx.$queryRaw<
    { data: unknown }[]
  >`SELECT app.read_goal_allocations(${id}::uuid,${[...accountIds]}::uuid[],${JSON.stringify(after)}::jsonb) AS data`;
  return goalAllocationRawPageSchema.parse(row?.data);
}
