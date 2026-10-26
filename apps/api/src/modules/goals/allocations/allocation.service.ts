import {
  goalAllocationSetDtoSchema,
  goalAllocationRawPageSchema,
  goalAllocationPageSchema,
  idempotencyKeySchema,
  scopeAccountIdsSchema,
  type AuthContext,
  type GoalAllocationWrite,
  type GoalAllocationSetDto,
  type GoalAllocationPage,
} from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import type {
  ArchiveDatabase,
  OwnerArchiveContext,
} from "@joint/database/archive";
import type { Prisma } from "@joint/database/client";
import { requireFreshMfa } from "../../accounts/account-transaction.js";
import { RequestReplay } from "../../households/request-replay.js";
import {
  hashToken,
  type IdentityVault,
} from "../../identity/identity-vault.js";
import { validateInput } from "../../../http-input.js";
import {
  canonicalAllocationWrite,
  readAllocationPage,
} from "./allocation-queries.js";
import { AllocationCursors, allocationBinding } from "./allocation-cursors.js";
import { safeAllocationQuery } from "./allocation-errors.js";

export class GoalAllocationService {
  private readonly replay: RequestReplay;
  private readonly cursors: AllocationCursors;
  constructor(
    private readonly database: Pick<ScopedDatabase, "withScope">,
    private readonly archive: Pick<ArchiveDatabase, "withScope">,
    vault: IdentityVault,
  ) {
    this.replay = new RequestReplay(vault);
    this.cursors = new AllocationCursors(vault);
  }
  write(
    context: AuthContext,
    goalId: string,
    version: number,
    input: GoalAllocationWrite,
    key: string,
  ): Promise<GoalAllocationSetDto> {
    const id = validateInput(idempotencyKeySchema, goalId).toLowerCase(),
      replayKey = validateInput(idempotencyKeySchema, key).toLowerCase(),
      data = canonicalAllocationWrite(input),
      route = `allocations:${context.householdId}:${id}`,
      digest = hashToken(JSON.stringify({ version, data }));
    return safeAllocationQuery(() =>
      this.database.withScope(context, async (tx) => {
        // This scoped read locks and rechecks the complete selection and goal
        // before accessing replay. Expected versions are compared only for a new write.
        await readAllocationPage(tx, id, data.accountIds, null);
        const previous = await this.replay.read(
          tx,
          context.userId,
          route,
          replayKey,
          digest,
          goalAllocationSetDtoSchema,
        );
        if (previous) return previous;
        const [row] = await tx.$queryRaw<
          { data: unknown }[]
        >`SELECT app.write_goal_allocations(${id}::uuid,${version}::integer,${JSON.stringify(data)}::jsonb) AS data`;
        const result = goalAllocationRawPageSchema.parse(row?.data).view;
        await this.replay.save(
          tx,
          context.userId,
          route,
          replayKey,
          digest,
          result,
        );
        return result;
      }),
    );
  }
  read(
    context: AuthContext,
    goalId: string,
    ids: readonly string[],
    cursor?: string,
  ): Promise<GoalAllocationPage> {
    return this.page(context, goalId, ids, cursor, false, false);
  }
  readArchive(
    context: OwnerArchiveContext,
    goalId: string,
    ids: readonly string[],
    cursor?: string,
  ): Promise<GoalAllocationPage> {
    return this.page(context, goalId, ids, cursor, true, false);
  }
  export(
    context: AuthContext,
    goalId: string,
    ids: readonly string[],
    cursor?: string,
  ): Promise<GoalAllocationPage> {
    return this.page(context, goalId, ids, cursor, false, true);
  }
  exportArchive(
    context: OwnerArchiveContext,
    goalId: string,
    ids: readonly string[],
    cursor?: string,
  ): Promise<GoalAllocationPage> {
    return this.page(context, goalId, ids, cursor, true, true);
  }
  private async page(
    context: AuthContext | OwnerArchiveContext,
    goalId: string,
    ids: readonly string[],
    cursor: string | undefined,
    archived: boolean,
    fresh: boolean,
  ): Promise<GoalAllocationPage> {
    if (fresh) requireFreshMfa(context);
    const id = validateInput(idempotencyKeySchema, goalId).toLowerCase(),
      accountIds = validateInput(scopeAccountIdsSchema, ids),
      binding = allocationBinding(context, archived, id, accountIds),
      after = this.cursors.read(cursor, binding);
    const query = (tx: Prisma.TransactionClient) =>
      readAllocationPage(tx, id, accountIds, after);
    const { nextAfter, ...page } = await safeAllocationQuery(() => {
      if (archived)
        return this.archive.withScope(
          {
            userId: context.userId,
            sessionId: context.sessionId,
            aal: context.aal,
            mfaAuthenticatedAt: context.mfaAuthenticatedAt,
            requestId: context.requestId,
          },
          query,
        );
      if (!("membershipId" in context))
        throw Error("Active allocations require household scope");
      return this.database.withScope(context, query);
    });
    if (fresh) requireFreshMfa(context);
    return goalAllocationPageSchema.parse({
      ...page,
      nextCursor:
        nextAfter === null ? null : this.cursors.seal(nextAfter, binding),
    });
  }
}
