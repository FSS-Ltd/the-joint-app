import { ConflictException } from "@nestjs/common";
import { importJobResultSchema, type AuthContext } from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import {
  lockActor,
  lockOwnedAccount,
  recordChange,
  requireVersion,
} from "../accounts/account-transaction.js";
import { hashToken, type IdentityVault } from "../identity/identity-vault.js";
import { RequestReplay } from "../households/request-replay.js";
import { batchSelect, findBatch, projectBatch } from "./import-projection.js";

export class ImportLifecycle {
  private readonly replay: RequestReplay;
  constructor(
    private readonly database: ScopedDatabase,
    vault: IdentityVault,
  ) {
    this.replay = new RequestReplay(vault);
  }
  commit(
    context: AuthContext,
    id: string,
    acceptRejectedRows: boolean,
    version: number,
    key: string,
  ) {
    const route = `commit:${id}`,
      digest = hashToken(JSON.stringify({ acceptRejectedRows }));
    return this.database.withScope(context, async (tx) => {
      await lockActor(tx, context);
      const batch = await findBatch(tx, context, id);
      await lockOwnedAccount(tx, context, batch.accountId);
      const previous = await this.replay.read(
        tx,
        context.userId,
        route,
        key,
        digest,
        importJobResultSchema,
      );
      if (previous)
        return { batch: await projectBatch(tx, batch), jobId: previous.jobId };
      if (batch.state === "COMMITTED")
        return { batch: await projectBatch(tx, batch), jobId: null };
      requireVersion(batch.version, version);
      const restore =
        batch.state === "ROLLED_BACK" ||
        (batch.state === "FAILED" &&
          batch.committedAt !== null &&
          batch.rolledBackAt !== null);
      const resume =
        batch.state === "FAILED" && batch.validRows > 0 && !restore;
      if (!restore && !resume && batch.state !== "READY")
        throw new ConflictException({ error: { code: "IMPORT_NOT_READY" } });
      if (!restore && !resume && batch.previewExpiresAt <= new Date())
        throw new ConflictException({ error: { code: "IMPORT_EXPIRED" } });
      if (!restore && batch.overlapRows > 0)
        throw new ConflictException({
          error: { code: "IMPORT_REVIEW_REQUIRED" },
        });
      if (!restore && batch.rejectedRows > 0 && !acceptRejectedRows)
        throw new ConflictException({
          error: { code: "IMPORT_REJECTS_UNCONFIRMED" },
        });
      const busy = await tx.importBatch.findFirst({
        where: {
          accountId: batch.accountId,
          id: { not: id },
          OR: [
            { state: "COMMITTING" },
            { state: "FAILED", committedRows: { gt: 0 } },
          ],
        },
        select: { id: true },
      });
      if (busy) throw new ConflictException({ error: { code: "IMPORT_BUSY" } });
      if (!restore && !resume) {
        const account = await tx.account.findUniqueOrThrow({
          where: { id: batch.accountId },
          select: { version: true },
        });
        if (account.version !== batch.datasetVersion)
          throw new ConflictException({ error: { code: "PREVIEW_STALE" } });
      }
      const updated = await tx.importBatch.update({
        where: { id },
        data: {
          state: "COMMITTING",
          version: { increment: 1 },
          failureCode: null,
          ...(!restore && !resume
            ? { processedRows: 0, committedRows: 0, skippedRows: 0 }
            : {}),
        },
        select: batchSelect,
      });
      const type = restore ? "csv.restore" : "csv.commit";
      const job = await tx.job.create({
        data: {
          householdId: context.householdId,
          type,
          resourceId: id,
          idempotencyKey: `${type}:${id}:${updated.version}`,
          payload: restore ? {} : { offset: resume ? batch.processedRows : 0 },
        },
        select: { id: true },
      });
      await tx.auditEvent.create({
        data: {
          userId: context.userId,
          householdId: context.householdId,
          action: restore
            ? "IMPORT_RESTORE_REQUESTED"
            : "IMPORT_COMMIT_REQUESTED",
        },
        select: { id: true },
      });
      const result = { batch: await projectBatch(tx, updated), jobId: job.id };
      await this.replay.save(tx, context.userId, route, key, digest, result);
      return result;
    });
  }
  rollback(context: AuthContext, id: string, version: number) {
    return this.database.withScope(context, async (tx) => {
      await lockActor(tx, context);
      const batch = await findBatch(tx, context, id);
      await lockOwnedAccount(tx, context, batch.accountId);
      requireVersion(batch.version, version);
      const [lineage] = await tx.$queryRaw<
        { pristine: boolean }[]
      >`SELECT app.import_is_pristine(${id}::uuid) AS pristine`;
      if (batch.state !== "COMMITTED" || !lineage?.pristine)
        throw new ConflictException({ error: { code: "IMPORT_PROTECTED" } });
      const row = await tx.importBatch.update({
        where: { id },
        data: {
          state: "ROLLED_BACK",
          rolledBackAt: new Date(),
          version: { increment: 1 },
        },
        select: batchSelect,
      });
      await tx.account.update({
        where: { id: batch.accountId },
        data: { version: { increment: 1 } },
        select: { id: true },
      });
      await recordChange(tx, context, "IMPORT_ROLLED_BACK");
      return projectBatch(tx, row);
    });
  }
  deleteOriginal(context: AuthContext, id: string, version: number) {
    return this.database.withScope(context, async (tx) => {
      await lockActor(tx, context);
      const batch = await findBatch(tx, context, id);
      await lockOwnedAccount(tx, context, batch.accountId);
      requireVersion(batch.version, version);
      await tx.importObject.update({
        where: { batchId: id },
        data: { ciphertext: null, deletedAt: new Date() },
        select: { batchId: true },
      });
      await tx.importBatch.update({
        where: { id },
        data: { version: { increment: 1 } },
        select: { id: true },
      });
      await tx.auditEvent.create({
        data: {
          userId: context.userId,
          householdId: context.householdId,
          action: "IMPORT_ORIGINAL_DELETED",
        },
        select: { id: true },
      });
      return projectBatch(tx, await findBatch(tx, context, id));
    });
  }
}
