import { BadRequestException } from "@nestjs/common";
import { accountCursorSchema, type AuthContext } from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
import type { ScopedDatabase } from "@joint/database/scoped";
import type { IdentityVault } from "../identity/identity-vault.js";
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
  async list(context: AuthContext, limit: number, cursor?: string) {
    const cursorContext = `accounts:${context.userId}:${context.membershipId}:${context.householdId}:${context.grantVersion}`;
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
        nextCursor:
          rows.length > limit && last
            ? this.vault.seal(
                JSON.stringify({
                  id: last.id,
                  createdAt: last.createdAt.toISOString(),
                }),
                cursorContext,
              )
            : null,
      };
    });
  }
}
