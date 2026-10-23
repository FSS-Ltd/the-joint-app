import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { AuthContext, GrantLevel } from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";

export interface AuthorizedAccountScope {
  readonly context: AuthContext;
  readonly accountIds: readonly string[];
  readonly level: Exclude<GrantLevel, "NONE">;
}

export class AccountAccessService {
  constructor(private readonly database: ScopedDatabase) {}
  async require(
    context: AuthContext,
    accountIds: readonly string[],
    level: Exclude<GrantLevel, "NONE">,
  ): Promise<AuthorizedAccountScope> {
    const ids = [...new Set(accountIds)];
    if (!ids.length || ids.length > 200) throw new BadRequestException();
    await this.database.withScope(context, async (tx) => {
      const [result] = await tx.$queryRaw<{ allowed: boolean }[]>`
        SELECT bool_and(app.account_access(id, ${level}::app."AccountGrantLevel")) AS allowed
        FROM unnest(${ids}::uuid[]) AS requested(id)`;
      if (!result?.allowed) throw new NotFoundException();
    });
    return { context, accountIds: ids, level };
  }
}
