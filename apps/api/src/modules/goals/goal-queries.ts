import {
  goalRevisionPageSchema,
  goalRevisionListSchema,
} from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
export async function prepareGoalQuery(
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.$executeRaw`SET LOCAL statement_timeout='5s'`;
  await tx.$executeRaw`SET LOCAL lock_timeout='5s'`;
}
export async function readGoal(
  tx: Prisma.TransactionClient,
  id: string,
  afterVersion: number,
): Promise<ReturnType<typeof goalRevisionPageSchema.parse>> {
  await prepareGoalQuery(tx);
  const [row] = await tx.$queryRaw<
    { data: unknown }[]
  >`SELECT app.read_goal(${id}::uuid,${afterVersion}::integer) AS data`;
  return goalRevisionPageSchema.parse(row?.data);
}
export async function listGoals(
  tx: Prisma.TransactionClient,
  afterId?: string,
): Promise<ReturnType<typeof goalRevisionListSchema.parse>> {
  await prepareGoalQuery(tx);
  const [row] = await tx.$queryRaw<
    { data: unknown }[]
  >`SELECT app.list_goals(${afterId ?? null}::uuid) AS data`;
  return goalRevisionListSchema.parse(row?.data);
}
