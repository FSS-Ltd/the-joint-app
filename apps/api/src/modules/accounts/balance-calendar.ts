import { ConflictException } from "@nestjs/common";
import type { AuthContext } from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";

interface CalendarRow {
  accountId: string;
  anchorId: string | null;
  nextChangeAt: Date | null;
}

/** Only effective anchor IDs and their next activation time enter status fingerprints. */
export async function observeBalanceCalendar(
  database: ScopedDatabase,
  context: AuthContext,
  accountIds: string[],
): Promise<{
  anchors: { accountId: string; anchorId: string | null }[];
  nextChangeAt: number | null;
}> {
  if (!accountIds.length) return { anchors: [], nextChangeAt: null };
  return database.withScope(context, async (tx) => {
    const rows = await tx.$queryRaw<CalendarRow[]>`
      SELECT a.id AS "accountId", anchor.id AS "anchorId",
        (future."asOfDate"::timestamp AT TIME ZONE 'Europe/London') AS "nextChangeAt"
      FROM app."Account" a
      LEFT JOIN LATERAL (
        SELECT b.id FROM app."BalanceSnapshot" b
        WHERE b."householdId"=a."householdId" AND b."accountId"=a.id
          AND b.source='MANUAL' AND b.complete
          AND b."asOfDate" <= (statement_timestamp() AT TIME ZONE 'Europe/London')::date
        ORDER BY b."asOfDate" DESC,b."createdAt" DESC,b.id ASC LIMIT 1
      ) anchor ON true
      LEFT JOIN LATERAL (
        SELECT b."asOfDate" FROM app."BalanceSnapshot" b
        WHERE b."householdId"=a."householdId" AND b."accountId"=a.id
          AND b.source='MANUAL' AND b.complete
          AND b."asOfDate" > (statement_timestamp() AT TIME ZONE 'Europe/London')::date
        ORDER BY b."asOfDate" ASC LIMIT 1
      ) future ON true
      WHERE coalesce(app.scope_is_valid(),false)
        AND a."householdId"=${context.householdId}::uuid AND a."archivedAt" IS NULL
        AND a.id=ANY(${accountIds}::uuid[]) AND app.account_access(a.id,'TOTALS')
      ORDER BY a.id`;
    if (rows.length !== accountIds.length)
      throw new ConflictException({ error: { code: "SCOPE_CHANGED" } });
    const deadlines = rows.flatMap((row) =>
      row.nextChangeAt ? [row.nextChangeAt.getTime()] : [],
    );
    return {
      anchors: rows.map(({ accountId, anchorId }) => ({ accountId, anchorId })),
      nextChangeAt: deadlines.length ? Math.min(...deadlines) : null,
    };
  });
}
