import type {
  AccountResponse,
  AuthContext,
  ClassificationKind,
} from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
import type { ScopeAccount } from "./report-scope.js";
import type { CashFlowComponent } from "@joint/domain/cash-flow";
export interface MonthComponent extends CashFlowComponent {
  month: string;
}
interface GroupRow {
  month: string;
  amountMinor: string;
  accountKind: AccountResponse["kind"];
  classificationKind: ClassificationKind | null;
  category: string | null;
  confirmed: boolean;
  grouped: boolean;
  count: bigint;
}
export interface SourceProvenance {
  latestRecordDate: Date | null;
  sourceRowCount: bigint;
}
export async function reportComponents(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  accounts: readonly ScopeAccount[],
  start: string,
  end: string,
  budgetCategories: readonly (string | null)[],
): Promise<MonthComponent[]> {
  const accountIds = accounts.map((account) => account.id);
  const rows = await tx.$queryRaw<GroupRow[]>`
 WITH accounts AS MATERIALIZED (SELECT * FROM jsonb_to_recordset(${JSON.stringify(accounts.map((a) => ({ id: a.id, kind: a.kind })))}::jsonb) AS x(id uuid,kind text)),
 source AS MATERIALIZED (
 SELECT t.id,t."accountId",t."bookedDate",t."amountMinor",a.kind AS "accountKind",o."classificationKind",o.category
 FROM app."Transaction" t JOIN accounts a ON a.id=t."accountId"
 LEFT JOIN app."TransactionOverride" o ON o."transactionId"=t.id
 WHERE t."householdId"=${context.householdId}::uuid AND t."accountId"=ANY(${[...accountIds]}::uuid[]) AND t.status='BOOKED'
 AND t."bookedDate">=${start}::date AND t."bookedDate"<${end}::date),
 components AS MATERIALIZED (
 SELECT s."bookedDate",s."accountKind",coalesce(p."amountMinor",s."amountMinor") AS "amountMinor",CASE WHEN p.id IS NULL THEN s."classificationKind" ELSE p."classificationKind" END AS "classificationKind",CASE WHEN p.id IS NULL THEN s.category ELSE p.category END AS category,(p.id IS NOT NULL OR s."classificationKind" IS NOT NULL) AS confirmed FROM source s LEFT JOIN app."TransactionSplit" p ON p."transactionId"=s.id),
 category_counts AS (SELECT category,count(*) AS n FROM components WHERE "amountMinor"<>0 GROUP BY category),
 retained AS MATERIALIZED (SELECT category FROM category_counts ORDER BY n DESC,category NULLS FIRST LIMIT 99),
 labelled AS (SELECT c.*, NOT(EXISTS(SELECT 1 FROM retained r WHERE r.category IS NOT DISTINCT FROM c.category) OR coalesce(c.category=ANY(${budgetCategories.filter((v): v is string => v !== null)}::text[]),false) OR (c.category IS NULL AND ${budgetCategories.includes(null)})) AS grouped FROM components c)
 SELECT to_char("bookedDate",'YYYY-MM') AS month,sum("amountMinor"::numeric)::text AS "amountMinor","accountKind","classificationKind",CASE WHEN grouped THEN NULL ELSE category END AS category,confirmed,grouped,count(*) AS count FROM labelled
 GROUP BY to_char("bookedDate",'YYYY-MM'),"accountKind","classificationKind",CASE WHEN grouped THEN NULL ELSE category END,confirmed,grouped,sign("amountMinor"::numeric)`;
  return rows.map((row) => ({
    month: row.month,
    amountMinor: row.amountMinor,
    currency: "GBP",
    accountKind: row.accountKind,
    classificationKind: row.classificationKind,
    category: row.category,
    confirmed: row.confirmed,
    aggregated: true,
    grouped: row.grouped,
    count: Number(row.count),
  }));
}
export async function reportProvenance(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  accountIds: readonly string[],
  start: string,
  end: string,
): Promise<SourceProvenance> {
  const [row] = await tx.$queryRaw<
    SourceProvenance[]
  >`SELECT max("bookedDate") AS "latestRecordDate",count(*) AS "sourceRowCount" FROM app."Transaction" WHERE "householdId"=${context.householdId}::uuid AND "accountId"=ANY(${[...accountIds]}::uuid[]) AND status='BOOKED' AND "bookedDate">=${start}::date AND "bookedDate"<${end}::date`;
  return row ?? { latestRecordDate: null, sourceRowCount: 0n };
}
