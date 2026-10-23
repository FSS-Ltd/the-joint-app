import {
  fundingEvidenceDtoSchema,
  fundingEvidenceWriteSchema,
  fundingEvidenceRawPageSchema,
  type AuthContext,
  type FundingEvidenceDto,
  type FundingEvidenceWrite,
  type FundingEvidencePage,
} from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import type {
  ArchiveDatabase,
  OwnerArchiveContext,
} from "@joint/database/archive";
import {
  lockActor,
  lockOwnedAccount,
  requireFreshMfa,
} from "../accounts/account-transaction.js";
import { validateInput } from "../../http-input.js";
import { RequestReplay } from "../households/request-replay.js";
import { hashToken, type IdentityVault } from "../identity/identity-vault.js";
import { FundingCursors } from "./funding-cursors.js";
import { safeFundingQuery } from "./funding-errors.js";
function binding(
  context: AuthContext | OwnerArchiveContext,
  id: string,
): string {
  const mode =
    "membershipId" in context
      ? `active:${context.householdId}:${context.membershipId}:${context.grantVersion}`
      : "archive";
  return `funding:${mode}:${context.userId}:${context.sessionId}:${id.toLowerCase()}`;
}
export class FundingEvidenceService {
  private readonly replay: RequestReplay;
  private readonly cursors: FundingCursors;
  constructor(
    private readonly database: Pick<ScopedDatabase, "withScope">,
    private readonly archive: Pick<ArchiveDatabase, "withScope">,
    vault: IdentityVault,
  ) {
    this.replay = new RequestReplay(vault);
    this.cursors = new FundingCursors(vault);
  }
  write(
    context: AuthContext,
    id: string,
    version: number,
    input: FundingEvidenceWrite,
    key: string,
  ): Promise<FundingEvidenceDto> {
    const data = validateInput(fundingEvidenceWriteSchema, input),
      route = `funding:${context.householdId}:${id.toLowerCase()}`,
      digest = hashToken(JSON.stringify({ version, data }));
    return safeFundingQuery(() =>
      this.database.withScope(context, async (tx) => {
        await lockActor(tx, context);
        await lockOwnedAccount(tx, context, id);
        const previous = await this.replay.read(
          tx,
          context.userId,
          route,
          key,
          digest,
          fundingEvidenceDtoSchema,
        );
        if (previous) return previous;
        const [row] = await tx.$queryRaw<
          { data: unknown }[]
        >`SELECT app.write_funding_evidence(${id}::uuid,${version}::integer,${JSON.stringify(data)}::jsonb) AS data`;
        const result = fundingEvidenceDtoSchema.parse(row?.data);
        await this.replay.save(tx, context.userId, route, key, digest, result);
        return result;
      }),
    );
  }
  async read(
    context: AuthContext,
    id: string,
    cursor?: string,
  ): Promise<FundingEvidencePage> {
    return this.page(context, id, cursor, false);
  }
  async readArchive(
    context: OwnerArchiveContext,
    id: string,
    cursor?: string,
  ): Promise<FundingEvidencePage> {
    return this.page(context, id, cursor, true);
  }
  private async page(
    context: AuthContext | OwnerArchiveContext,
    id: string,
    cursor: string | undefined,
    archived: boolean,
  ): Promise<FundingEvidencePage> {
    // Archive mode intentionally strips active-household fields from its binding.
    const scopedContext: OwnerArchiveContext = {
      userId: context.userId,
      sessionId: context.sessionId,
      aal: context.aal,
      mfaAuthenticatedAt: context.mfaAuthenticatedAt,
      requestId: context.requestId,
    };
    const tokenBinding = binding(archived ? scopedContext : context, id),
      after = this.cursors.read(cursor, tokenBinding);
    const query = async (
      tx: import("@joint/database/client").Prisma.TransactionClient,
    ) => {
      const [row] = await tx.$queryRaw<
        { data: unknown }[]
      >`SELECT app.read_funding_evidence(${id}::uuid,${after}::integer) AS data`;
      return fundingEvidenceRawPageSchema.parse(row?.data);
    };
    const { nextAfterVersion, ...page } = await safeFundingQuery(() => {
      if (archived) return this.archive.withScope(scopedContext, query);
      if (!("membershipId" in context))
        throw Error("Active funding requires household scope");
      return this.database.withScope(context, query);
    });
    return {
      ...page,
      nextCursor:
        nextAfterVersion === null
          ? null
          : this.cursors.seal(nextAfterVersion, tokenBinding),
    };
  }
  async export(
    context: AuthContext,
    id: string,
    cursor?: string,
  ): Promise<FundingEvidencePage> {
    requireFreshMfa(context);
    return this.read(context, id, cursor);
  }
  async exportArchive(
    context: OwnerArchiveContext,
    id: string,
    cursor?: string,
  ): Promise<FundingEvidencePage> {
    requireFreshMfa(context);
    return this.readArchive(context, id, cursor);
  }
}
