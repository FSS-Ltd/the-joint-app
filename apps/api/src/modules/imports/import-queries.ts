import { BadRequestException } from "@nestjs/common";
import {
  accountCursorSchema,
  normalizedCsvRowSchema,
  type AuthContext,
  type importRowsQuerySchema,
} from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
import type { ScopedDatabase } from "@joint/database/scoped";
import type { IdentityVault } from "../identity/identity-vault.js";
import { ownsAccount } from "../transactions/transaction-projection.js";
import { NotFoundException } from "@nestjs/common";
import { batchSelect, findBatch, projectBatch } from "./import-projection.js";

export class ImportQueries {
  constructor(
    private readonly database: ScopedDatabase,
    private readonly vault: IdentityVault,
  ) {}
  read(context: AuthContext, id: string) {
    return this.observe(context, id).then((snapshot) => snapshot.status);
  }
  observe(context: AuthContext, id: string) {
    return this.database.withScope(context, async (tx) => {
      const row = await findBatch(tx, context, id);
      const status = await projectBatch(tx, row);
      const deadlines = [
        status.permissions.canCommit ? row.previewExpiresAt.getTime() : null,
        status.originalAvailable
          ? (row.object?.expiresAt.getTime() ?? null)
          : null,
      ].filter(
        (value): value is number => value !== null && value > Date.now(),
      );
      return {
        status,
        expiresAt: deadlines.length ? Math.min(...deadlines) : null,
      };
    });
  }
  async list(
    context: AuthContext,
    accountId: string,
    limit: number,
    cursor?: string,
  ) {
    const aad = `imports:${context.userId}:${context.membershipId}:${context.householdId}:${context.grantVersion}:${accountId}`;
    let after: Prisma.ImportBatchWhereInput = {};
    if (cursor) {
      try {
        const value = accountCursorSchema.parse(
          JSON.parse(this.vault.open(cursor, aad)),
        );
        after = {
          OR: [
            { createdAt: { lt: new Date(value.createdAt) } },
            { createdAt: new Date(value.createdAt), id: { gt: value.id } },
          ],
        };
      } catch {
        throw new BadRequestException({ error: { code: "INVALID_CURSOR" } });
      }
    }
    return this.database.withScope(context, async (tx) => {
      if (!(await ownsAccount(tx, context, accountId)))
        throw new NotFoundException();
      const rows = await tx.importBatch.findMany({
        where: { householdId: context.householdId, accountId, ...after },
        select: batchSelect,
        take: limit + 1,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      });
      const page = rows.slice(0, limit),
        last = page.at(-1);
      const committedIds = page
        .filter((row) => row.state === "COMMITTED")
        .map((row) => row.id);
      const lineage = committedIds.length
        ? await tx.$queryRaw<
            { id: string; pristine: boolean }[]
          >`SELECT id, app.import_is_pristine(id) AS pristine FROM unnest(${committedIds}::uuid[]) AS ids(id)`
        : [];
      const pristine = new Map(lineage.map((row) => [row.id, row.pristine]));
      return {
        items: await Promise.all(
          page.map((row) =>
            projectBatch(tx, row, pristine.get(row.id) ?? false),
          ),
        ),
        nextCursor:
          rows.length > limit && last
            ? this.vault.seal(
                JSON.stringify({
                  id: last.id,
                  createdAt: last.createdAt.toISOString(),
                }),
                aad,
              )
            : null,
      };
    });
  }
  rows(
    context: AuthContext,
    id: string,
    query: ReturnType<typeof importRowsQuerySchema.parse>,
  ) {
    return this.database.withScope(context, async (tx) => {
      const batch = await findBatch(tx, context, id);
      const rows = await tx.$queryRaw<{ value: Prisma.JsonValue }[]>`
        SELECT CASE WHEN r.value->>'status'='VALID' THEN jsonb_set(r.value,'{decision}',to_jsonb(coalesce(b.decisions->>(r.value->>'rowNumber'),r.value->>'decision'))) ELSE r.value END AS value
        FROM app."ImportBatch" b CROSS JOIN LATERAL jsonb_array_elements(b.preview) WITH ORDINALITY AS r(value,position)
        WHERE b.id=${id}::uuid AND (${query.filter}='ALL' OR (${query.filter}='REJECTED' AND r.value->>'status'='REJECTED')
          OR (${query.filter}='REVIEW' AND r.value->>'status'='VALID' AND coalesce(b.decisions->>(r.value->>'rowNumber'),r.value->>'decision')='REVIEW'))
        ORDER BY r.position OFFSET ${query.offset} LIMIT ${query.limit + 1}`;
      const page = rows
        .slice(0, query.limit)
        .map((row) => normalizedCsvRowSchema.parse(row.value));
      const fingerprints = [
        ...new Set(
          page.flatMap((row) =>
            row.status === "VALID" ? [row.fingerprint] : [],
          ),
        ),
      ];
      const candidates = fingerprints.length
        ? await tx.$queryRaw<
            {
              fingerprint: string;
              transactionId: string;
              bookedDate: Date;
              amountMinor: bigint;
              currency: string;
              description: string;
            }[]
          >`
        SELECT * FROM app.import_overlap_candidates(${batch.accountId}::uuid,${fingerprints}::text[])`
        : [];
      const items = page.map((row) =>
        row.status === "REJECTED"
          ? row
          : {
              ...row,
              overlaps: candidates
                .filter(
                  (candidate) => candidate.fingerprint === row.fingerprint,
                )
                .map((candidate) => ({
                  transactionId: candidate.transactionId,
                  bookedDate: candidate.bookedDate.toISOString().slice(0, 10),
                  money: {
                    amountMinor: candidate.amountMinor.toString(),
                    currency: candidate.currency,
                  },
                  description: candidate.description,
                })),
            },
      );
      return {
        items,
        nextOffset:
          rows.length > query.limit ? query.offset + query.limit : null,
      };
    });
  }
}
