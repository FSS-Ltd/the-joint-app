import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import type { AuthContext, WealthSummaryDto } from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import { valueAccounts } from "@joint/domain/wealth";
import { readWealthScope } from "./wealth.repository.js";
import { readLondonClock } from "../../london-clock.js";

export class WealthService {
  constructor(private readonly database: ScopedDatabase) {}
  async read(
    context: AuthContext,
    accountIds?: readonly string[],
  ): Promise<WealthSummaryDto> {
    return (await this.evaluate(context, accountIds)).summary;
  }

  observe(
    context: AuthContext,
    accountIds?: readonly string[],
  ): Promise<{ summary: WealthSummaryDto; nextChangeAt: number }> {
    return this.evaluate(context, accountIds);
  }

  private evaluate(
    context: AuthContext,
    accountIds?: readonly string[],
  ): Promise<{ summary: WealthSummaryDto; nextChangeAt: number }> {
    return this.database.withScope(context, async (tx) => {
      const accounts = await readWealthScope(tx, context, accountIds);
      const clock = await readLondonClock(tx);
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
      return { summary: result, nextChangeAt: clock.nextMidnightAt.getTime() };
    });
  }
}
