import { BadRequestException, NotFoundException } from "@nestjs/common";
import { accountCursorSchema, type AuthContext } from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
import type { ScopedDatabase } from "@joint/database/scoped";
import type { IdentityVault } from "../identity/identity-vault.js";
import {
  ownsAccount,
  pairedTransactionIds,
  projectTransaction,
  readTransaction,
  transactionInclude,
} from "./transaction-projection.js";

import {
  transactionFilters,
  type ActivityFilters,
} from "./transaction-filters.js";

export class TransactionQueries {
  constructor(
    private readonly database: ScopedDatabase,
    private readonly vault: IdentityVault,
  ) {}
  read(context: AuthContext, id: string) {
    return this.database.withScope(context, (tx) =>
      readTransaction(tx, context, id),
    );
  }
  async list(
    context: AuthContext,
    accountId: string,
    limit: number,
    cursor?: string,
    filters: ActivityFilters = {},
  ) {
    const filterKey = JSON.stringify([
      filters.month ?? null,
      filters.search ?? null,
      filters.category ?? null,
      filters.uncategorized ?? false,
      filters.classificationKind ?? null,
    ]);
    const aad = `transactions:${context.userId}:${context.membershipId}:${context.householdId}:${context.grantVersion}:${accountId}:${filterKey}`;
    let after: Prisma.TransactionWhereInput = {};
    if (cursor) {
      try {
        const value = accountCursorSchema.parse(
          JSON.parse(this.vault.open(cursor, aad)),
        );
        after = {
          OR: [
            { bookedDate: { lt: new Date(value.createdAt) } },
            { bookedDate: new Date(value.createdAt), id: { gt: value.id } },
          ],
        };
      } catch {
        throw new BadRequestException({ error: { code: "INVALID_CURSOR" } });
      }
    }
    return this.database.withScope(context, async (tx) => {
      const [access] = await tx.$queryRaw<
        { allowed: boolean }[]
      >`SELECT app.account_access(${accountId}::uuid,'TRANSACTIONS') AS allowed`;
      if (!access?.allowed) throw new NotFoundException();
      const rows = await tx.transaction.findMany({
        where: {
          householdId: context.householdId,
          accountId,
          status: "BOOKED",
          AND: [after, transactionFilters(filters)],
        },
        take: limit + 1,
        orderBy: [{ bookedDate: "desc" }, { id: "asc" }],
        include: transactionInclude(context),
      });
      const owned = await ownsAccount(tx, context, accountId);
      const page = rows.slice(0, limit),
        last = page.at(-1);
      const paired = await pairedTransactionIds(
        tx,
        page.map((row) => row.id),
      );
      return {
        items: page.map((row) =>
          projectTransaction(row, owned, paired.has(row.id)),
        ),
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
}
