import { randomUUID } from "node:crypto";
import {
  goalDtoSchema,
  goalWriteSchema,
  type GoalDto,
  type GoalListDto,
  type GoalPageDto,
  type AuthContext,
  type GoalWrite,
} from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import type {
  ArchiveDatabase,
  OwnerArchiveContext,
} from "@joint/database/archive";
import { lockActor, requireFreshMfa } from "../accounts/account-transaction.js";
import { validateInput } from "../../http-input.js";
import { safeGoalQuery } from "./goal-errors.js";
import { listGoals, prepareGoalQuery, readGoal } from "./goal-queries.js";
import { GoalCursors } from "./goal-cursors.js";
import { RequestReplay } from "../households/request-replay.js";
import { hashToken, type IdentityVault } from "../identity/identity-vault.js";
function binding(
  context: AuthContext | OwnerArchiveContext,
  archived: boolean,
): string {
  const mode =
    !archived && "membershipId" in context
      ? `active:${context.householdId}:${context.membershipId}:${context.grantVersion}`
      : "archive";
  return `goals:${mode}:${context.userId}:${context.sessionId}`;
}
export class GoalService {
  private readonly cursors: GoalCursors;
  private readonly replay: RequestReplay;
  constructor(
    private readonly database: Pick<ScopedDatabase, "withScope">,
    private readonly archive: Pick<ArchiveDatabase, "withScope">,
    vault: IdentityVault,
  ) {
    this.cursors = new GoalCursors(vault);
    this.replay = new RequestReplay(vault);
  }
  create(
    context: AuthContext,
    input: GoalWrite,
    key: string,
  ): Promise<GoalDto> {
    const data = validateInput(goalWriteSchema, input),
      route = `goals:${context.householdId}`,
      digest = hashToken(JSON.stringify(data));
    return safeGoalQuery(() =>
      this.database.withScope(context, async (tx) => {
        await prepareGoalQuery(tx);
        await lockActor(tx, context);
        const previous = await this.replay.read(
          tx,
          context.userId,
          route,
          key,
          digest,
          goalDtoSchema,
        );
        if (previous) return (await readGoal(tx, previous.id, 2147483647)).goal;
        const id = randomUUID();
        const [row] = await tx.$queryRaw<
          { data: unknown }[]
        >`SELECT app.write_goal(${id}::uuid,0,${JSON.stringify(data)}::jsonb) AS data`;
        const result = goalDtoSchema.parse(row?.data);
        await this.replay.save(tx, context.userId, route, key, digest, result);
        return result;
      }),
    );
  }
  write(
    context: AuthContext,
    id: string,
    version: number,
    input: GoalWrite,
  ): Promise<GoalDto> {
    const data = validateInput(goalWriteSchema, input);
    return safeGoalQuery(() =>
      this.database.withScope(context, async (tx) => {
        await prepareGoalQuery(tx);
        const [row] = await tx.$queryRaw<
          { data: unknown }[]
        >`SELECT app.write_goal(${id}::uuid,${version}::integer,${JSON.stringify(data)}::jsonb) AS data`;
        return goalDtoSchema.parse(row?.data);
      }),
    );
  }
  async read(
    context: AuthContext,
    id: string,
    cursor?: string,
  ): Promise<GoalPageDto> {
    const key = `${binding(context, false)}:${id}:history`,
      after = this.cursors.version(cursor, key);
    const { nextAfterVersion, ...page } = await safeGoalQuery(() =>
      this.database.withScope(context, (tx) => readGoal(tx, id, after)),
    );
    return {
      ...page,
      nextCursor:
        nextAfterVersion === null
          ? null
          : this.cursors.seal(nextAfterVersion, key),
    };
  }
  async list(context: AuthContext, cursor?: string): Promise<GoalListDto> {
    const key = `${binding(context, false)}:list`,
      after = this.cursors.id(cursor, key);
    const { nextAfterId, ...page } = await safeGoalQuery(() =>
      this.database.withScope(context, (tx) => listGoals(tx, after)),
    );
    return {
      ...page,
      nextCursor:
        nextAfterId === null ? null : this.cursors.seal(nextAfterId, key),
    };
  }
  async readArchive(
    context: OwnerArchiveContext,
    id: string,
    cursor?: string,
  ): Promise<GoalPageDto> {
    const key = `${binding(context, true)}:${id}:history`,
      after = this.cursors.version(cursor, key);
    const { nextAfterVersion, ...page } = await safeGoalQuery(() =>
      this.archive.withScope(context, (tx) => readGoal(tx, id, after)),
    );
    return {
      ...page,
      nextCursor:
        nextAfterVersion === null
          ? null
          : this.cursors.seal(nextAfterVersion, key),
    };
  }
  async listArchive(
    context: OwnerArchiveContext,
    cursor?: string,
  ): Promise<GoalListDto> {
    const key = `${binding(context, true)}:list`,
      after = this.cursors.id(cursor, key);
    const { nextAfterId, ...page } = await safeGoalQuery(() =>
      this.archive.withScope(context, (tx) => listGoals(tx, after)),
    );
    return {
      ...page,
      nextCursor:
        nextAfterId === null ? null : this.cursors.seal(nextAfterId, key),
    };
  }
  async export(
    context: AuthContext,
    id: string,
    cursor?: string,
  ): Promise<GoalPageDto> {
    requireFreshMfa(context);
    return this.read(context, id, cursor);
  }
  async exportArchive(
    context: OwnerArchiveContext,
    id: string,
    cursor?: string,
  ): Promise<GoalPageDto> {
    requireFreshMfa(context);
    return this.readArchive(context, id, cursor);
  }
}
