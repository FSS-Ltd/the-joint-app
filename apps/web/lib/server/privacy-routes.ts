import {
  accountListQuerySchema,
  accountListSchema,
  accountSchema,
  entitlementResponseSchema,
  exportScopeSchema,
  exportStatusSchema,
  transactionListSchema,
} from "@joint/contracts";
import { assertMutation, sessionToken } from "./browser-security";
import { financeId, financeQuery } from "./finance-boundary";
import { requestBody } from "./request-body";
import { BffError, json, parseResponse, route } from "./responses";
import { privacyUpstream } from "./privacy-upstream";

function exportPath(
  householdId?: string,
): `/v1/households/${string}/exports` | "/v1/me/archive/exports" {
  return householdId
    ? `/v1/households/${financeId(householdId)}/exports`
    : "/v1/me/archive/exports";
}
export function createExport(
  request: Request,
  householdId?: string,
): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = sessionToken(request);
    const body = await requestBody(request, exportScopeSchema);
    const response = await privacyUpstream(exportPath(householdId), token, {
      body,
    });
    return json(parseResponse(exportStatusSchema, await response.json()), 202);
  });
}
export function readExport(
  request: Request,
  id: string,
  householdId?: string,
): Promise<Response> {
  return route(async () => {
    const response = await privacyUpstream(
      `${exportPath(householdId)}/${financeId(id)}`,
      sessionToken(request),
    );
    return json(parseResponse(exportStatusSchema, await response.json()));
  });
}
export async function downloadExport(
  request: Request,
  id: string,
  householdId?: string,
): Promise<Response> {
  const result = await route(async () => {
    if (new URL(request.url).search)
      throw new BffError(
        400,
        "INVALID_INPUT",
        "Download options are not supported.",
      );
    const response = await privacyUpstream(
      `${exportPath(householdId)}/${financeId(id)}/download`,
      sessionToken(request),
      { signal: request.signal },
    );
    if (
      !response.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("text/csv") ||
      !response.body
    ) {
      await response.body?.cancel();
      throw new BffError(
        503,
        "INVALID_RESPONSE",
        "This export could not be downloaded. Please request a new export.",
      );
    }
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="joint-export.csv"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        Vary: "Cookie",
      },
    });
  });
  if (result.ok) return result;
  const failure: unknown = await result.json();
  const mfa =
    typeof failure === "object" &&
    failure !== null &&
    "error" in failure &&
    typeof failure.error === "object" &&
    failure.error !== null &&
    "code" in failure.error &&
    failure.error.code === "MFA_REAUTH_REQUIRED";
  return new Response(null, {
    status: 303,
    headers: {
      Location: `${householdId ? "/settings/privacy" : "/archive"}?export=${mfa ? "mfa" : "unavailable"}`,
      "Cache-Control": "no-store",
      Vary: "Cookie",
    },
  });
}
export function readEntitlements(
  request: Request,
  householdId: string,
): Promise<Response> {
  return route(async () =>
    json(
      parseResponse(
        entitlementResponseSchema,
        await (
          await privacyUpstream(
            `/v1/households/${financeId(householdId)}/entitlements`,
            sessionToken(request),
          )
        ).json(),
      ),
    ),
  );
}
export function archiveAccounts(
  request: Request,
  accountId?: string,
  transactions = false,
): Promise<Response> {
  return route(async () => {
    const token = sessionToken(request);
    const path = accountId
      ? (`/v1/me/archive/accounts/${financeId(accountId)}` as const)
      : "/v1/me/archive/accounts";
    if (transactions && accountId) {
      const query = financeQuery(request, accountListQuerySchema);
      return json(
        parseResponse(
          transactionListSchema,
          await (
            await privacyUpstream(`${path}/transactions`, token, { query })
          ).json(),
        ),
      );
    }
    const response = await privacyUpstream(
      path,
      token,
      accountId ? {} : { query: financeQuery(request, accountListQuerySchema) },
    );
    return json(
      accountId
        ? parseResponse(accountSchema, await response.json())
        : parseResponse(accountListSchema, await response.json()),
    );
  });
}
