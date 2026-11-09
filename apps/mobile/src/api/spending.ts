import {
  accountCoverageInputSchema,
  accountCoverageSchema,
  budgetSchema,
  budgetUpsertSchema,
  categoriesSchema,
  idempotencyKeySchema,
  monthSchema,
  quotedVersionSchema,
  scopeAccountIdsSchema,
  spendingReportSchema,
  type BudgetResponse,
  type SpendingReport,
} from "@joint/contracts";
import type { NativeTransport } from "./types";

export type AccountCoverage = ReturnType<typeof accountCoverageSchema.parse>;
export type CategoriesResponse = ReturnType<typeof categoriesSchema.parse>;
type BudgetUpsertInput = ReturnType<typeof budgetUpsertSchema.parse>;

function version(value: number): number {
  return quotedVersionSchema.parse(`"${value}"`);
}

function household(id: string): string {
  return `households/${idempotencyKeySchema.parse(id)}`;
}

export function createSpendingApi(transport: NativeTransport) {
  return {
    async readReport(
      householdId: string,
      month: string,
      accountIds?: readonly string[],
      signal?: AbortSignal,
    ): Promise<SpendingReport> {
      const validMonth = monthSchema.parse(month);
      const path = `${household(householdId)}/reports/spending`;
      const query = new URLSearchParams({ month: validMonth });
      if (accountIds !== undefined) {
        query.set(
          "accountIds",
          scopeAccountIdsSchema.parse(accountIds).join(","),
        );
      }
      return transport.request(
        `${path}?${query.toString()}`,
        spendingReportSchema,
        {
          method: "GET",
          signal: signal ?? new AbortController().signal,
        },
      );
    },

    async putBudget(
      householdId: string,
      month: string,
      body: BudgetUpsertInput,
      expectedVersion: number,
      signal?: AbortSignal,
    ): Promise<BudgetResponse> {
      const validMonth = monthSchema.parse(month);
      const parsedBody = budgetUpsertSchema.parse(body);
      const path = `${household(householdId)}/budgets/${validMonth}`;
      return transport.request(path, budgetSchema, {
        method: "PUT",
        signal: signal ?? new AbortController().signal,
        body: parsedBody,
        version: version(expectedVersion),
      });
    },

    async attestCoverage(
      householdId: string,
      accountId: string,
      month: string,
      complete: boolean,
      expectedVersion: number,
      signal?: AbortSignal,
    ): Promise<AccountCoverage> {
      const validMonth = monthSchema.parse(month);
      const validAccountId = idempotencyKeySchema.parse(accountId);
      const parsedBody = accountCoverageInputSchema.parse({ complete });
      const path = `${household(householdId)}/accounts/${validAccountId}/coverage/${validMonth}`;
      return transport.request(path, accountCoverageSchema, {
        method: "PUT",
        signal: signal ?? new AbortController().signal,
        body: parsedBody,
        version: version(expectedVersion),
      });
    },

    async categories(
      householdId: string,
      accountIds?: readonly string[],
      signal?: AbortSignal,
    ): Promise<CategoriesResponse> {
      const path = `${household(householdId)}/categories`;
      const query = new URLSearchParams();
      if (accountIds !== undefined) {
        query.set(
          "accountIds",
          scopeAccountIdsSchema.parse(accountIds).join(","),
        );
      }
      const suffix = query.size ? `?${query.toString()}` : "";
      return transport.request(`${path}${suffix}`, categoriesSchema, {
        method: "GET",
        signal: signal ?? new AbortController().signal,
      });
    },
  };
}

export type SpendingApi = ReturnType<typeof createSpendingApi>;
