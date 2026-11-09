import {
  recurringCostsResponseSchema,
  type AuthContext,
  type ClassificationKind,
  type RecurringCostsResponse,
} from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import {
  detectRecurringCosts,
  resolveCategoryPrecedence,
  type RecurringTransactionInput,
} from "@joint/domain/spending";
import { resolveReportScope } from "./report-scope.js";

interface TxRow {
  id: string;
  accountId: string;
  currency: string;
  amountMinor: string;
  bookedDate: string;
  description: string;
  merchant: string | null;
  overrideTransactionId: string | null;
  overrideCategory: string | null;
  splitCategory: string | null;
  overrideKind: ClassificationKind | null;
  splitKind: ClassificationKind | null;
}

export class RecurringCostsService {
  constructor(private readonly database: ScopedDatabase) {}

  async read(
    context: AuthContext,
    accountIds?: readonly string[],
  ): Promise<RecurringCostsResponse> {
    return this.database.withScope(context, async (tx) => {
      const scope = await resolveReportScope(tx, context, accountIds);
      const ids = scope.map((a) => a.id);
      if (ids.length === 0) {
        return recurringCostsResponseSchema.parse({
          candidates: [],
          calculatedAt: new Date().toISOString(),
          windowDays: 180,
        });
      }

      const rules = await tx.categorisationRule.findMany({
        where: { householdId: context.householdId, enabled: true },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      });

      const rows = await tx.$queryRaw<TxRow[]>`
        SELECT t.id, t."accountId", t.currency, t."amountMinor"::text AS "amountMinor",
               to_char(t."bookedDate", 'YYYY-MM-DD') AS "bookedDate",
               t.description, o.merchant,
               o."transactionId" AS "overrideTransactionId",
               o.category AS "overrideCategory",
               p.category AS "splitCategory",
               o."classificationKind" AS "overrideKind",
               p."classificationKind" AS "splitKind"
        FROM app."Transaction" t
        LEFT JOIN app."TransactionOverride" o ON o."transactionId"=t.id
        LEFT JOIN app."TransactionSplit" p ON p."transactionId"=t.id
        WHERE t."householdId"=${context.householdId}::uuid
          AND t."accountId"=ANY(${ids}::uuid[])
          AND t.status='BOOKED'
          AND t."bookedDate">=(CURRENT_DATE - INTERVAL '180 days')
        ORDER BY t."bookedDate" ASC
      `;

      const txInputs: RecurringTransactionInput[] = rows.map((row) => {
        const hasExplicitOverride = row.overrideTransactionId !== null;
        const resolution = resolveCategoryPrecedence({
          overrideCategory: hasExplicitOverride
            ? row.overrideCategory
            : undefined,
          hasExplicitOverride,
          rules,
          description: row.description,
          merchant: row.merchant,
        });

        let effectiveMerchant = row.merchant;
        if (!effectiveMerchant && resolution.ruleId) {
          const matchedRule = rules.find((r) => r.id === resolution.ruleId);
          if (matchedRule) {
            effectiveMerchant = matchedRule.merchantPattern;
          }
        }

        return {
          id: row.id,
          accountId: row.accountId,
          currency: row.currency,
          amountMinor: row.amountMinor,
          bookedDate: row.bookedDate,
          description: row.description,
          merchant: effectiveMerchant,
          category: resolution.category ?? row.splitCategory,
          classificationKind: row.splitKind ?? row.overrideKind,
        };
      });

      const result = detectRecurringCosts(txInputs);
      return recurringCostsResponseSchema.parse(result);
    });
  }
}
