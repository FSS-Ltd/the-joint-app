import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { scopeAccountIdsSchema, type AuthContext } from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
import type { ScopedWealthAccount } from "@joint/domain/wealth";

interface WealthRow extends Omit<ScopedWealthAccount, "snapshot"> {
  valuationId: string | null;
  amountMinor: bigint | null;
  adultAmountMinor: bigint | null;
  currency: string | null;
  asOfDate: Date | null;
  complete: boolean | null;
  source: string | null;
}

/** One statement bounds both visible accounts and each account's history in SQL. */
export async function readWealthScope(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  accountIds?: readonly string[],
): Promise<readonly ScopedWealthAccount[]> {
  if (
    accountIds !== undefined &&
    !scopeAccountIdsSchema.safeParse(accountIds).success
  )
    throw new BadRequestException({ error: { code: "INVALID_SCOPE" } });
  const rows = await tx.$queryRaw<WealthRow[]>`
    SELECT a.id,a.kind,a."legalOwnerKind",a.liquidity,a."totalsVersion",
      b.id AS "valuationId",b."amountMinor",b."adultAmountMinor",b.currency,b."asOfDate",b.complete,b.source
    FROM (
      SELECT id,kind,"legalOwnerKind",liquidity,"totalsVersion","householdId"
      FROM app."Account" WHERE "householdId"=${context.householdId}::uuid
        AND "archivedAt" IS NULL AND app.account_access(id,'TOTALS')
        AND (${accountIds === undefined} OR id=ANY(${accountIds ? [...accountIds] : []}::uuid[]))
      ORDER BY id LIMIT 51
    ) a LEFT JOIN LATERAL (
      SELECT id,"amountMinor","adultAmountMinor",currency,"asOfDate",complete,source
      FROM app."BalanceSnapshot" WHERE "householdId"=a."householdId" AND "accountId"=a.id
      ORDER BY "asOfDate" DESC,"createdAt" DESC,id ASC LIMIT 1
    ) b ON true ORDER BY a.id`;
  if (accountIds !== undefined && rows.length !== accountIds.length)
    throw new NotFoundException();
  if (rows.length > 50)
    throw new BadRequestException({ error: { code: "SCOPE_REQUIRED" } });
  return rows.map(project);
}
function project(row: WealthRow): ScopedWealthAccount {
  const { id, kind, legalOwnerKind, liquidity, totalsVersion } = row;
  const account = { id, kind, legalOwnerKind, liquidity, totalsVersion };
  if (row.valuationId === null) return { ...account, snapshot: null };
  if (
    row.amountMinor === null ||
    row.currency === null ||
    row.asOfDate === null ||
    row.complete === null ||
    row.source !== "MANUAL"
  )
    throw new ServiceUnavailableException();
  return {
    ...account,
    snapshot: {
      id: row.valuationId,
      money: {
        amountMinor: row.amountMinor.toString(),
        currency: row.currency,
      },
      adultMoney:
        row.adultAmountMinor === null
          ? null
          : {
              amountMinor: row.adultAmountMinor.toString(),
              currency: row.currency,
            },
      asOfDate: row.asOfDate.toISOString().slice(0, 10),
      complete: row.complete,
      source: row.source,
    },
  };
}
