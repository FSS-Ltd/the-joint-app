import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import type { AuthContext, WealthSummaryDto } from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import { valueAccounts } from "@joint/domain/wealth";
import { readWealthScope } from "./wealth.repository.js";

export class WealthService {
  constructor(private readonly database: ScopedDatabase) {}
  async read(
    context: AuthContext,
    accountIds?: readonly string[],
  ): Promise<WealthSummaryDto> {
    return this.database.withScope(context, async (tx) => {
      const accounts = await readWealthScope(tx, context, accountIds);
      const [clock] = await tx.$queryRaw<
        { today: string; now: Date }[]
      >`SELECT (statement_timestamp() AT TIME ZONE 'Europe/London')::date::text AS today, statement_timestamp() AS now`;
      if (!clock) throw Error("Wealth evaluation clock unavailable");
      const result = valueAccounts({
        householdId: context.householdId,
        grantVersion: context.grantVersion,
        asOfDate: clock.today,
        calculatedAt: clock.now.toISOString(),
        accounts,
      });
      let current;
      try {
        current = await readWealthScope(tx, context, accountIds);
      } catch (error) {
        if (
          error instanceof NotFoundException ||
          error instanceof BadRequestException
        )
          throw new ConflictException({ error: { code: "SCOPE_CHANGED" } });
        throw error;
      }
      const [scope] = await tx.$queryRaw<
        { valid: boolean }[]
      >`SELECT app.scope_is_valid() AS valid`;
      const sources = current.map((a) => ({
        accountId: a.id,
        totalsVersion: a.totalsVersion,
        valuationId: a.snapshot?.id ?? null,
      }));
      if (
        !scope?.valid ||
        JSON.stringify(sources) !== JSON.stringify(result.scope.sources)
      )
        throw new ConflictException({ error: { code: "SCOPE_CHANGED" } });
      return result;
    });
  }
}
