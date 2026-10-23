import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  importJobResultSchema,
  type AuthContext,
  type CsvMapping,
} from "@joint/contracts";
import { DataVault } from "@joint/database/data-vault";
import type { ScopedDatabase } from "@joint/database/scoped";
import { CsvInputError, inspectCsv } from "@joint/domain/csv";
import { randomUUID } from "node:crypto";
import {
  lockActor,
  lockOwnedAccount,
} from "../accounts/account-transaction.js";
import { ownsAccount } from "../transactions/transaction-projection.js";
import { hashToken, type IdentityVault } from "../identity/identity-vault.js";
import { RequestReplay } from "../households/request-replay.js";
import { batchSelect, findBatch, projectBatch } from "./import-projection.js";
import { createHash } from "node:crypto";

export class ImportPreview {
  private readonly replay: RequestReplay;
  constructor(
    private readonly database: ScopedDatabase,
    vault: IdentityVault,
    private readonly objects?: DataVault,
  ) {
    this.replay = new RequestReplay(vault);
  }
  async inspect(context: AuthContext, accountId: string, bytes: Uint8Array) {
    await this.database.withScope(context, async (tx) => {
      if (!(await ownsAccount(tx, context, accountId)))
        throw new NotFoundException();
    });
    try {
      return await inspectCsv(bytes);
    } catch (error) {
      if (error instanceof CsvInputError)
        throw new BadRequestException({ error: { code: error.code } });
      throw error;
    }
  }
  async preview(
    context: AuthContext,
    accountId: string,
    bytes: Uint8Array,
    mapping: CsvMapping,
    key: string,
  ) {
    if (!this.objects)
      throw new ServiceUnavailableException({
        error: { code: "IMPORTS_UNAVAILABLE" },
      });
    const inspection = await this.inspect(context, accountId, bytes);
    const indexes = [
      mapping.date,
      mapping.description,
      mapping.amount,
      mapping.debit,
      mapping.credit,
      mapping.currency,
      mapping.sourceId,
    ];
    if (
      indexes.some(
        (index) => index !== null && index >= inspection.columns.length,
      )
    )
      throw new BadRequestException({ error: { code: "CSV_INVALID_MAPPING" } });
    const checksum = createHash("sha256").update(bytes).digest("hex"),
      mappingHash = hashToken(JSON.stringify(mapping));
    const route = `preview:${accountId}`,
      digest = hashToken(`${checksum}:${mappingHash}`);
    const objects = this.objects;
    return this.database.withScope(context, async (tx) => {
      await lockActor(tx, context);
      await lockOwnedAccount(tx, context, accountId);
      const previous = await this.replay.read(
        tx,
        context.userId,
        route,
        key,
        digest,
        importJobResultSchema,
      );
      if (previous)
        return {
          batch: await projectBatch(
            tx,
            await findBatch(tx, context, previous.batch.id),
          ),
          jobId: previous.jobId,
        };
      const existing = await tx.importBatch.findUnique({
        where: {
          accountId_fileChecksum: { accountId, fileChecksum: checksum },
        },
        select: batchSelect,
      });
      if (existing && ["COMMITTED", "ROLLED_BACK"].includes(existing.state)) {
        const result = { batch: await projectBatch(tx, existing), jobId: null };
        await this.replay.save(tx, context.userId, route, key, digest, result);
        return result;
      }
      if (
        existing &&
        (["QUEUED", "PREVIEWING", "COMMITTING"].includes(existing.state) ||
          existing.committedRows > 0)
      )
        throw new ConflictException({ error: { code: "IMPORT_BUSY" } });
      const id = existing?.id ?? randomUUID(),
        expiresAt = new Date(Date.now() + 86400_000);
      const ciphertext = objects.seal(
        bytes,
        `import:${context.householdId}:${accountId}:${id}`,
      );
      const data = {
        mappingHash,
        mapping,
        parserVersion: "csv-v1",
        state: "QUEUED" as const,
        preview: [],
        decisions: {},
        totalRows: inspection.rowCount,
        processedRows: 0,
        validRows: 0,
        rejectedRows: 0,
        overlapRows: 0,
        duplicateRows: 0,
        committedRows: 0,
        skippedRows: 0,
        failureCode: null,
        previewExpiresAt: expiresAt,
      };
      const row = existing
        ? await tx.importBatch.update({
            where: { id },
            data: { ...data, version: { increment: 1 } },
            select: batchSelect,
          })
        : await tx.importBatch.create({
            data: {
              ...data,
              id,
              householdId: context.householdId,
              accountId,
              requestedByUserId: context.userId,
              requestedByMembershipId: context.membershipId,
              fileChecksum: checksum,
            },
            select: batchSelect,
          });
      await tx.importObject.upsert({
        where: { batchId: id },
        create: {
          batchId: id,
          householdId: context.householdId,
          accountId,
          ciphertext,
          expiresAt,
        },
        update: { ciphertext, expiresAt, deletedAt: null },
        select: { batchId: true },
      });
      const job = await tx.job.create({
        data: {
          householdId: context.householdId,
          type: "csv.preview",
          resourceId: id,
          idempotencyKey: `preview:${id}:${row.version}`,
          payload: {},
        },
        select: { id: true },
      });
      await tx.auditEvent.create({
        data: {
          userId: context.userId,
          householdId: context.householdId,
          action: "IMPORT_PREVIEW_REQUESTED",
        },
        select: { id: true },
      });
      const result = {
        batch: await projectBatch(tx, await findBatch(tx, context, id)),
        jobId: job.id,
      };
      await this.replay.save(tx, context.userId, route, key, digest, result);
      return result;
    });
  }
}
