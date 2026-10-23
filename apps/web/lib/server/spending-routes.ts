import {
  accountCoverageInputSchema,
  accountCoverageSchema,
  budgetQuerySchema,
  budgetSchema,
  budgetUpsertSchema,
  categoriesSchema,
  categoryQuerySchema,
  monthSchema,
  quotedVersionSchema,
  spendingQuerySchema,
  spendingReportSchema,
  transactionSchema,
  transactionSplitsSchema,
  transferConfirmSchema,
  transferRemoveSchema,
  transferResultSchema,
} from "@joint/contracts";
import { assertMutation, sessionToken } from "./browser-security";
import { financeId, financeKey, financeQuery } from "./finance-boundary";
import { requestBody } from "./request-body";
import { BffError, json, parseResponse, route } from "./responses";
import { upstream } from "./upstream";
function month(value: string): string {
  const result = monthSchema.safeParse(value);
  if (!result.success)
    throw new BffError(400, "INVALID_INPUT", "Choose a calendar month.");
  return result.data;
}
function version(request: Request, zero = false): string {
  const value = request.headers.get("If-Match");
  const parsed = quotedVersionSchema.safeParse(value);
  if (!value || !parsed.success || (!zero && parsed.data === 0))
    throw new BffError(
      400,
      "INVALID_INPUT",
      "Reload this record and try again.",
    );
  return value;
}
export function readSpending(
  request: Request,
  householdId: string,
): Promise<Response> {
  return route(async () =>
    json(
      parseResponse(
        spendingReportSchema,
        await upstream(
          `/v1/households/${financeId(householdId)}/reports/spending`,
          {
            token: await sessionToken(request),
            query: financeQuery(request, spendingQuerySchema),
          },
        ),
      ),
    ),
  );
}
export function readCategories(
  request: Request,
  householdId: string,
): Promise<Response> {
  return route(async () =>
    json(
      parseResponse(
        categoriesSchema,
        await upstream(`/v1/households/${financeId(householdId)}/categories`, {
          token: await sessionToken(request),
          query: financeQuery(request, categoryQuerySchema),
        }),
      ),
    ),
  );
}
export function readBudget(
  request: Request,
  householdId: string,
  period: string,
): Promise<Response> {
  return route(async () =>
    json(
      parseResponse(
        spendingReportSchema,
        await upstream(
          `/v1/households/${financeId(householdId)}/budgets/${month(period)}`,
          {
            token: await sessionToken(request),
            query: financeQuery(request, budgetQuerySchema),
          },
        ),
      ),
    ),
  );
}
export function writeBudget(
  request: Request,
  householdId: string,
  period: string,
): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = await sessionToken(request),
      path =
        `/v1/households/${financeId(householdId)}/budgets/${month(period)}` as const,
      ifMatch = version(request, true),
      body = await requestBody(request, budgetUpsertSchema);
    return json(
      parseResponse(
        budgetSchema,
        await upstream(path, { token, body, ifMatch, method: "PUT" }),
      ),
    );
  });
}
export function writeCoverage(
  request: Request,
  householdId: string,
  accountId: string,
  period: string,
): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = await sessionToken(request),
      path =
        `/v1/households/${financeId(householdId)}/accounts/${financeId(accountId)}/coverage/${month(period)}` as const,
      ifMatch = version(request, true),
      body = await requestBody(request, accountCoverageInputSchema);
    return json(
      parseResponse(
        accountCoverageSchema,
        await upstream(path, { token, body, ifMatch, method: "PUT" }),
      ),
    );
  });
}
export function writeSplits(
  request: Request,
  householdId: string,
  transactionId: string,
): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = await sessionToken(request),
      path =
        `/v1/households/${financeId(householdId)}/transactions/${financeId(transactionId)}/splits` as const,
      ifMatch = version(request),
      body = await requestBody(request, transactionSplitsSchema);
    return json(
      parseResponse(
        transactionSchema,
        await upstream(path, { token, body, ifMatch, method: "PUT" }),
      ),
    );
  });
}
export function confirmTransfer(
  request: Request,
  householdId: string,
): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = await sessionToken(request),
      path =
        `/v1/households/${financeId(householdId)}/transfers/confirm` as const,
      idempotencyKey = financeKey(request),
      body = await requestBody(request, transferConfirmSchema);
    return json(
      parseResponse(
        transferResultSchema,
        await upstream(path, { token, body, idempotencyKey }),
      ),
    );
  });
}
export function removeTransfer(
  request: Request,
  householdId: string,
  transferId: string,
): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = await sessionToken(request),
      path =
        `/v1/households/${financeId(householdId)}/transfers/${financeId(transferId)}` as const,
      body = await requestBody(request, transferRemoveSchema);
    return json(
      parseResponse(
        transferResultSchema,
        await upstream(path, { token, body, method: "DELETE" }),
      ),
    );
  });
}

export function readTransfer(
  request: Request,
  householdId: string,
  transferId: string,
): Promise<Response> {
  return route(async () =>
    json(
      parseResponse(
        transferResultSchema,
        await upstream(
          `/v1/households/${financeId(householdId)}/transfers/${financeId(transferId)}`,
          { token: await sessionToken(request) },
        ),
      ),
    ),
  );
}
