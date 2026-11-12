import { BadRequestException } from "@nestjs/common";
import {
  accountCursorSchema,
  type AccountResponse,
  type AuthContext,
} from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
import type { ScopedDatabase } from "@joint/database/scoped";
import type { IdentityVault } from "../identity/identity-vault.js";
import { readCsvBalances } from "./csv-balance.js";
import { observeBalanceCalendar } from "./balance-calendar.js";
import {
  accountInclude,
  partnerMembership,
  projectAccount,
  readAccount,
} from "./account-projection.js";

export class AccountQueries {
  constructor(
    private readonly database: ScopedDatabase,
    private readonly vault: IdentityVault,
  ) {}
  read(context: AuthContext, accountId: string) {
    return this.database.withScope(context, (tx) =>
      readAccount(tx, context, accountId),
    );
  }
  csvBalances(context: AuthContext, accountIds: string[]) {
    return readCsvBalances(this.database, context, accountIds);
  }
  observeBalanceCalendar(context: AuthContext, accountIds: string[]) {
    return observeBalanceCalendar(this.database, context, accountIds);
  }
  async list(context: AuthContext, limit: number, cursor?: string) {
    const page = await this.page(context, limit, cursor);
    return {
      items: page.items,
      nextCursor:
        page.hasMore && page.last
          ? this.vault.seal(
              JSON.stringify(page.last),
              this.cursorContext(context),
            )
          : null,
    };
  }
  async observePage(
    context: AuthContext,
    limit: number,
    cursor?: string,
  ): Promise<{ items: AccountResponse[]; hasMore: boolean }> {
    const { items, hasMore } = await this.page(context, limit, cursor);
    return { items, hasMore };
  }
  private cursorContext(context: AuthContext): string {
    return `accounts:${context.userId}:${context.membershipId}:${context.householdId}:${context.grantVersion}`;
  }
  private async page(context: AuthContext, limit: number, cursor?: string) {
    const cursorContext = this.cursorContext(context);
    let after: Prisma.AccountWhereInput = {};
    if (cursor) {
      try {
        const value = accountCursorSchema.parse(
          JSON.parse(this.vault.open(cursor, cursorContext)),
        );
        after = {
          OR: [
            { createdAt: { gt: new Date(value.createdAt) } },
            { createdAt: new Date(value.createdAt), id: { gt: value.id } },
          ],
        };
      } catch {
        throw new BadRequestException({ error: { code: "INVALID_CURSOR" } });
      }
    }
    return this.database.withScope(context, async (tx) => {
      const rows = await tx.account.findMany({
        where: { householdId: context.householdId, archivedAt: null, ...after },
        include: accountInclude,
        take: limit + 1,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const partner = await partnerMembership(tx, context);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => projectAccount(row, context, partner)),
        hasMore: rows.length > limit,
        last: last
          ? { id: last.id, createdAt: last.createdAt.toISOString() }
          : null,
      };
    });
  }
}
