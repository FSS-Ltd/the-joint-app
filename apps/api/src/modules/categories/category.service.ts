import { ConflictException } from "@nestjs/common";
import { categoriesSchema, type AuthContext } from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import { resolveReportScope } from "../reports/report-scope.js";
const suggestions = [
  "Food",
  "Home",
  "Transport",
  "Health",
  "Family",
  "Leisure",
  "Education",
  "Bills",
];
export class CategoriesService {
  constructor(private readonly database: ScopedDatabase) {}
  async list(context: AuthContext, accountIds?: readonly string[]) {
    return this.database.withScope(context, async (tx) => {
      const scope = await resolveReportScope(tx, context, accountIds),
        ids = scope.map((a) => a.id);
      const rows = ids.length
        ? await tx.$queryRaw<
            { category: string | null }[]
          >`SELECT category FROM (SELECT o.category FROM app."TransactionOverride" o JOIN app."Transaction" t ON t.id=o."transactionId" WHERE t."householdId"=${context.householdId}::uuid AND t."accountId"=ANY(${ids}::uuid[]) AND t.status='BOOKED' UNION SELECT p.category FROM app."TransactionSplit" p JOIN app."Transaction" t ON t.id=p."transactionId" WHERE t."householdId"=${context.householdId}::uuid AND t."accountId"=ANY(${ids}::uuid[]) AND t.status='BOOKED') labels ORDER BY category NULLS FIRST LIMIT 191`
        : [];
      const again = await resolveReportScope(tx, context, accountIds);
      const [valid] = await tx.$queryRaw<
        { valid: boolean }[]
      >`SELECT app.scope_is_valid() AS valid`;
      if (!valid?.valid || JSON.stringify(scope) !== JSON.stringify(again))
        throw new ConflictException({ error: { code: "SCOPE_CHANGED" } });
      return categoriesSchema.parse({
        items: [
          null,
          ...new Set([
            ...rows.flatMap((r) => (r.category === null ? [] : [r.category])),
            ...suggestions,
          ]),
        ].slice(0, 200),
      });
    });
  }
}
