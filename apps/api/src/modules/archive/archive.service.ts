import { BadRequestException } from "@nestjs/common";
import {
  accountCursorSchema,
  type AccountResponse,
  type TransactionResponse,
} from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
import type {
  ArchiveDatabase,
  OwnerArchiveContext,
} from "@joint/database/archive";
import type { IdentityVault } from "../identity/identity-vault.js";
import { projectTransaction } from "../transactions/transaction-projection.js";
import {
  archiveAccountInclude,
  projectArchiveAccount,
  readArchiveAccount,
} from "./archive-projection.js";

interface ArchivePage<T> {
  items: T[];
  nextCursor: string | null;
}

export class ArchiveService {
  constructor(
    private readonly database: ArchiveDatabase,
    private readonly vault: IdentityVault,
  ) {}

  read(
    context: OwnerArchiveContext,
    accountId: string,
  ): Promise<AccountResponse> {
    return this.database.withScope(context, (tx) =>
      readArchiveAccount(tx, accountId),
    );
  }

  async list(
    context: OwnerArchiveContext,
    limit: number,
    cursor?: string,
  ): Promise<ArchivePage<AccountResponse>> {
    requireLimit(limit);
    const aad = `archive-accounts:${context.userId}:${context.sessionId}`;
    const value = this.cursor(cursor, aad);
    const after: Prisma.AccountWhereInput = value
      ? {
          OR: [
            { createdAt: { gt: new Date(value.createdAt) } },
            { createdAt: new Date(value.createdAt), id: { gt: value.id } },
          ],
        }
      : {};
    return this.database.withScope(context, async (tx) => {
      const rows = await tx.account.findMany({
        where: {
          ...after,
          owners: { some: { userId: context.userId, status: "ARCHIVED" } },
        },
        include: archiveAccountInclude,
        take: limit + 1,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const page = rows.slice(0, limit),
        last = page.at(-1);
      return {
        items: page.map(projectArchiveAccount),
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

  async transactions(
    context: OwnerArchiveContext,
    accountId: string,
    limit: number,
    cursor?: string,
  ): Promise<ArchivePage<TransactionResponse>> {
    requireLimit(limit);
    const aad = `archive-transactions:${context.userId}:${context.sessionId}:${accountId}`;
    const value = this.cursor(cursor, aad);
    const after: Prisma.TransactionWhereInput = value
      ? {
          OR: [
            { bookedDate: { lt: new Date(value.createdAt) } },
            { bookedDate: new Date(value.createdAt), id: { gt: value.id } },
          ],
        }
      : {};
    return this.database.withScope(context, async (tx) => {
      const source = await readArchiveAccount(tx, accountId);
      const rows = await tx.transaction.findMany({
        where: {
          householdId: source.householdId,
          accountId,
          status: "BOOKED",
          ...after,
        },
        take: limit + 1,
        orderBy: [{ bookedDate: "desc" }, { id: "asc" }],
        include: {
          override: true,
          account: { select: { kind: true } },
          splits: { orderBy: { position: "asc" } },
          notes: { where: { authorUserId: context.userId } },
        },
      });
      const page = rows.slice(0, limit),
        last = page.at(-1);
      return {
        items: page.map((row) => {
          const result = projectTransaction(
            { ...row, transfersFrom: [], transfersTo: [] },
            false,
          );
          return {
            ...result,
            permissions: {
              canCorrect: false,
              canClassify: false,
              canNote: false,
            },
          };
        }),
        nextCursor:
          rows.length > limit && last
            ? this.vault.seal(
                JSON.stringify({
                  id: last.id,
                  createdAt: last.bookedDate.toISOString(),
                }),
                aad,
              )
            : null,
      };
    });
  }

  private cursor(cursor: string | undefined, aad: string) {
    if (!cursor) return null;
    try {
      return accountCursorSchema.parse(
        JSON.parse(this.vault.open(cursor, aad)),
      );
    } catch {
      throw new BadRequestException({ error: { code: "INVALID_CURSOR" } });
    }
  }
}

function requireLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)
    throw new BadRequestException({ error: { code: "INVALID_PAGE_LIMIT" } });
}
