import { sessionAuthorization } from "./clerk-session";
import {
  deletionPublicReceiptSchema,
  deletionReceiptSchema,
  deletionRequestSchema,
  deletionStatusSchema,
  leaveHouseholdResponseSchema,
  leaveHouseholdSchema,
  readEnvironment,
  webEnvironmentSchema,
} from "@joint/contracts";
import {
  assertMutation,
  CSRF_COOKIE,
  INVITATION_COOKIE,
  SESSION_COOKIE,
  sessionToken,
  setCookie,
} from "./browser-security";
import { financeId } from "./finance-boundary";
import { requestBody } from "./request-body";
import { BffError, json, parseResponse, route } from "./responses";

const RECEIPT = "joint-deletion-receipt";
function clearSession(response: Response): void {
  setCookie(response, SESSION_COOKIE, "", 0, "Lax");
  setCookie(response, CSRF_COOKIE, "", 0, "Strict");
  setCookie(response, INVITATION_COOKIE, "", 0, "Lax");
}
async function lifecycleFetch(
  path:
    | `/v1/households/${string}/memberships/me`
    | "/v1/privacy/deletion-requests"
    | `/v1/privacy/deletion-requests/${string}`,
  authorization: string,
  body?: object,
  method?: "DELETE",
) {
  const environment = readEnvironment(webEnvironmentSchema, process.env);
  const response = await fetch(new URL(path, environment.API_BASE_URL), {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      Authorization: authorization,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const mfa =
      typeof value === "object" &&
      value !== null &&
      "error" in value &&
      typeof value.error === "object" &&
      value.error !== null &&
      "code" in value.error &&
      (value.error.code === "MFA_REAUTH_REQUIRED" ||
        value.error.code === "MFA_REQUIRED");
    throw new BffError(
      mfa
        ? 403
        : [400, 401, 403, 404, 409, 429].includes(response.status)
          ? response.status
          : 503,
      mfa ? "MFA_REAUTH_REQUIRED" : "PRIVACY_UNAVAILABLE",
      mfa
        ? "Verify a fresh authenticator code in Account security, then try again."
        : "This privacy action is unavailable. Sign in again or try shortly.",
    );
  }
  return value;
}
export function leaveHousehold(
  request: Request,
  householdId: string,
): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = await sessionToken(request);
    const body = await requestBody(request, leaveHouseholdSchema);
    const response = json(
      parseResponse(
        leaveHouseholdResponseSchema,
        await lifecycleFetch(
          `/v1/households/${financeId(householdId)}/memberships/me`,
          sessionAuthorization(token),
          body,
          "DELETE",
        ),
      ),
    );
    clearSession(response);
    return response;
  });
}
export function requestDeletion(request: Request): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = await sessionToken(request);
    const body = await requestBody(request, deletionRequestSchema);
    const receipt = parseResponse(
      deletionReceiptSchema,
      await lifecycleFetch(
        "/v1/privacy/deletion-requests",
        sessionAuthorization(token),
        body,
      ),
    );
    const response = json(
      parseResponse(deletionPublicReceiptSchema, {
        id: receipt.id,
        state: receipt.state,
        expiresAt: receipt.expiresAt,
      }),
      202,
    );
    const secure =
      new URL(process.env.WEB_ORIGIN ?? request.url).protocol === "https:"
        ? "; Secure"
        : "";
    response.headers.append(
      "Set-Cookie",
      `${RECEIPT}=${receipt.id}.${receipt.statusToken}; Path=/api/privacy; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.min(30 * 86400, Math.floor((Date.parse(receipt.expiresAt) - Date.now()) / 1000)))}${secure}`,
    );
    clearSession(response);
    return response;
  });
}
export function deletionStatus(
  request: Request,
  id: string,
): Promise<Response> {
  return route(async () => {
    const valid = financeId(id);
    const matches = (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${RECEIPT}=`));
    const receipt =
      matches.length === 1 ? matches[0]?.slice(RECEIPT.length + 1) : undefined;
    const parsed = receipt?.match(/^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/i);
    if (!parsed || parsed[1] !== valid)
      throw new BffError(
        401,
        "RECEIPT_REQUIRED",
        "This deletion receipt is unavailable in this browser or has expired.",
      );
    if (new URL(request.url).search)
      throw new BffError(
        400,
        "INVALID_INPUT",
        "This receipt could not be read.",
      );
    return json(
      parseResponse(
        deletionStatusSchema,
        await lifecycleFetch(
          `/v1/privacy/deletion-requests/${valid}`,
          `Deletion ${parsed[2]}`,
        ),
      ),
    );
  });
}
