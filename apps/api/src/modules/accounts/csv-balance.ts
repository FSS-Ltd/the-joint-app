import { ConflictException, NotFoundException } from "@nestjs/common";
import {
  csvBalanceListSchema,
  moneySchema,
  type CsvBalance,
  type AuthContext,
} from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";

interface BalanceRow {
  accountId: string;
  kind: string;
  revision: number;
  anchorId: string | null;
  anchorDate: Date | null;
  amountMinor: string | null;
  throughDate: Date | null;
}
export async function readCsvBalances(
  database: ScopedDatabase,
  context: AuthContext,
  ids: string[],
): Promise<{ items: CsvBalance[] }> {
  return database.withScope(context, async (tx) => {
    const rows = await tx.$queryRaw<
      BalanceRow[]
    >`SELECT * FROM app.csv_balance_estimates(${ids}::uuid[])`;
    if (rows.length !== ids.length) throw new NotFoundException();
    const current = await tx.$queryRaw<
      { accountId: string; revision: number }[]
    >`
      SELECT a.id AS "accountId", a."totalsVersion" AS revision
      FROM app."Account" a
      WHERE coalesce(app.scope_is_valid(), false)
        AND a."householdId"=${context.householdId}::uuid
        AND a."archivedAt" IS NULL AND a.id=ANY(${ids}::uuid[])
        AND app.account_access(a.id,'TOTALS')
      ORDER BY a.id`;
    if (
      rows.length !== current.length ||
      rows.some(
        (row, index) =>
          row.accountId !== current[index]?.accountId ||
          row.revision !== current[index]?.revision,
      )
    )
      throw new ConflictException({ error: { code: "SCOPE_CHANGED" } });
    const items: CsvBalance[] = rows.map((row) => {
      const accountId = row.accountId;
      if (row.kind !== "CURRENT" && row.kind !== "SAVINGS")
        return { accountId, status: "UNSUPPORTED" };
      if (!row.anchorId || !row.anchorDate)
        return { accountId, status: "MISSING_ANCHOR" };
      const money = moneySchema.safeParse({
        amountMinor: row.amountMinor,
        currency: "GBP",
      });
      if (!money.success) return { accountId, status: "OUT_OF_RANGE" };
      return {
        accountId,
        status: "AVAILABLE",
        basis: "MANUAL_PLUS_LEDGER",
        money: money.data,
        anchorId: row.anchorId,
        anchorDate: row.anchorDate.toISOString().slice(0, 10),
        throughDate: (row.throughDate ?? row.anchorDate)
          .toISOString()
          .slice(0, 10),
      };
    });
    return csvBalanceListSchema.parse({ items });
  });
}
