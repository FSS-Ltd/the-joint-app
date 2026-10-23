import { HttpException, NotFoundException } from "@nestjs/common";
import {
  exportScopeSchema,
  exportStatusSchema,
  type AuthContext,
  type ExportScope,
  type ExportStatus,
} from "@joint/contracts";
import type {
  ArchiveDatabase,
  OwnerArchiveContext,
} from "@joint/database/archive";
import type { Prisma } from "@joint/database/client";
import { DataVault } from "@joint/database/data-vault";
import type { ScopedDatabase } from "@joint/database/scoped";
import { isExportUnavailable } from "./export-errors.js";
import { requireFreshMfa } from "../accounts/account-transaction.js";

type Context = AuthContext | OwnerArchiveContext;
type Apply<T> = (transaction: Prisma.TransactionClient) => Promise<T>;
interface ChunkRow {
  ciphertext: string | null;
  done: boolean;
}
interface StatusRow {
  id: string;
  state: ExportStatus["state"];
  createdAt: Date;
  expiresAt: Date;
  downloadExpiresAt: Date | null;
}

export class ExportService {
  constructor(
    private readonly database: ScopedDatabase,
    private readonly archiveDatabase: ArchiveDatabase,
    private readonly vault: DataVault,
  ) {}

  requestExport(
    context: AuthContext,
    scope: ExportScope,
  ): Promise<ExportStatus> {
    return this.request(context, scope, false);
  }
  requestArchiveExport(
    context: OwnerArchiveContext,
    scope: ExportScope,
  ): Promise<ExportStatus> {
    return this.request(context, scope, true);
  }
  status(context: AuthContext, id: string): Promise<ExportStatus> {
    return this.readStatus(context, id, false);
  }
  archiveStatus(
    context: OwnerArchiveContext,
    id: string,
  ): Promise<ExportStatus> {
    return this.readStatus(context, id, true);
  }
  download(
    context: AuthContext,
    id: string,
    range?: string,
    signal?: AbortSignal,
  ): Promise<AsyncGenerator<Uint8Array>> {
    return this.openDownload(context, id, false, range, signal);
  }
  downloadArchive(
    context: OwnerArchiveContext,
    id: string,
    range?: string,
    signal?: AbortSignal,
  ): Promise<AsyncGenerator<Uint8Array>> {
    return this.openDownload(context, id, true, range, signal);
  }

  private async scoped<T>(
    context: Context,
    archive: boolean,
    apply: Apply<T>,
  ): Promise<T> {
    try {
      if (archive) return await this.archiveDatabase.withScope(context, apply);
      if (!("householdId" in context)) throw new NotFoundException();
      return await this.database.withScope(context, apply);
    } catch (error) {
      if (isExportUnavailable(error)) throw new NotFoundException();
      throw error;
    }
  }
  private async request(
    context: Context,
    scope: ExportScope,
    archive: boolean,
  ): Promise<ExportStatus> {
    requireFreshMfa(context);
    const parsed = exportScopeSchema.parse(scope);
    const id = await this.scoped(context, archive, async (tx) => {
      const [row] = await tx.$queryRaw<
        { id: string }[]
      >`SELECT app.request_export(${parsed.accountIds}::uuid[],${archive}) AS id`;
      if (!row) throw new NotFoundException();
      return row.id;
    });
    return this.readStatus(context, id, archive);
  }
  private async readStatus(
    context: Context,
    id: string,
    archive: boolean,
  ): Promise<ExportStatus> {
    return this.scoped(context, archive, async (tx) => {
      const [row] = await tx.$queryRaw<
        StatusRow[]
      >`SELECT * FROM app.export_status(${id}::uuid)`;
      if (!row) throw new NotFoundException();
      return exportStatusSchema.parse({
        ...row,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        downloadExpiresAt: row.downloadExpiresAt?.toISOString() ?? null,
      });
    });
  }
  private async readChunk(
    context: Context,
    id: string,
    archive: boolean,
    sequence: number,
  ): Promise<Uint8Array> {
    return this.scoped(context, archive, async (tx) => {
      const [row] = await tx.$queryRaw<
        ChunkRow[]
      >`SELECT * FROM app.export_download_chunk(${id}::uuid,${sequence})`;
      if (!row || row.done || row.ciphertext === null)
        throw new NotFoundException();
      return this.vault.open(row.ciphertext, `export:${id}:chunk:${sequence}`);
    });
  }
  private async openDownload(
    context: Context,
    id: string,
    archive: boolean,
    range?: string,
    signal?: AbortSignal,
  ): Promise<AsyncGenerator<Uint8Array>> {
    requireFreshMfa(context);
    const status = await this.readStatus(context, id, archive);
    if (range !== undefined)
      throw new HttpException("Range requests are unsupported", 416);
    if (
      status.state !== "READY" ||
      status.downloadExpiresAt === null ||
      Date.parse(status.downloadExpiresAt) <= Date.now()
    )
      throw new NotFoundException();
    if (signal?.aborted) throw new NotFoundException();
    // Validate and decrypt before headers are sent. Every later chunk repeats the
    // full database fence, including the same live opaque session.
    await this.readChunk(context, id, archive, 0);
    return this.streamChunks(context, id, archive, signal);
  }

  private async *streamChunks(
    context: Context,
    id: string,
    archive: boolean,
    signal?: AbortSignal,
  ): AsyncGenerator<Uint8Array> {
    if (signal?.aborted) return;
    for (let sequence = 0; !signal?.aborted; sequence++) {
      const chunk = await this.scoped(context, archive, async (tx) => {
        const [row] = await tx.$queryRaw<
          ChunkRow[]
        >`SELECT * FROM app.export_download_chunk(${id}::uuid,${sequence})`;
        if (!row) throw new NotFoundException();
        if (row.done) {
          if (row.ciphertext !== null) throw new NotFoundException();
          return null;
        }
        if (row.ciphertext === null) throw new NotFoundException();
        return this.vault.open(
          row.ciphertext,
          `export:${id}:chunk:${sequence}`,
        );
      });
      if (signal?.aborted) return;
      if (chunk === null) return;
      yield chunk;
    }
  }
}
