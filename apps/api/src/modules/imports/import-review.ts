import { ConflictException, ServiceUnavailableException } from "@nestjs/common";
import {
  normalizedCsvRowSchema,
  type AuthContext,
  type importReviewSchema,
} from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
import type { ScopedDatabase } from "@joint/database/scoped";
import {
  lockActor,
  lockOwnedAccount,
  requireVersion,
} from "../accounts/account-transaction.js";
import { findBatch, projectBatch } from "./import-projection.js";

export class ImportReview {
  constructor(private readonly database: ScopedDatabase) {}
  review(
    context: AuthContext,
    id: string,
    input: ReturnType<typeof importReviewSchema.parse>,
    version: number,
  ) {
    return this.database.withScope(context, async (tx) => {
      await lockActor(tx, context);
      const batch = await findBatch(tx, context, id);
      await lockOwnedAccount(tx, context, batch.accountId);
      requireVersion(batch.version, version);
      if (batch.state !== "READY" || batch.previewExpiresAt <= new Date())
        throw new ConflictException({ error: { code: "IMPORT_NOT_READY" } });
      const rowNumbers = input.decisions.map((row) => row.rowNumber);
      const rows = await tx.$queryRaw<
        { value: Prisma.JsonValue }[]
      >`SELECT r.value FROM app."ImportBatch" b CROSS JOIN LATERAL jsonb_array_elements(b.preview) r(value) WHERE b.id=${id}::uuid AND (r.value->>'rowNumber')::integer=ANY(${rowNumbers}::integer[])`;
      if (
        rows.length !== rowNumbers.length ||
        rows.some((row) => {
          const parsed = normalizedCsvRowSchema.parse(row.value);
          return parsed.status !== "VALID" || parsed.duplicate;
        })
      )
        throw new ConflictException({
          error: { code: "IMPORT_REVIEW_REQUIRED" },
        });
      const patch = JSON.stringify(
        Object.fromEntries(
          input.decisions.map((row) => [String(row.rowNumber), row.decision]),
        ),
      );
      const count =
        await tx.$executeRaw`UPDATE app."ImportBatch" SET decisions=decisions||${patch}::jsonb,version=version+1,"updatedAt"=clock_timestamp() WHERE id=${id}::uuid`;
      if (count !== 1) throw new ServiceUnavailableException();
      await tx.$executeRaw`UPDATE app."ImportBatch" b SET "overlapRows"=(SELECT count(*) FROM jsonb_array_elements(b.preview) r(value) WHERE r.value->>'status'='VALID' AND coalesce(b.decisions->>(r.value->>'rowNumber'),r.value->>'decision')='REVIEW') WHERE b.id=${id}::uuid`;
      return projectBatch(tx, await findBatch(tx, context, id));
    });
  }
}
