import { sessionAuthorization } from "./clerk-session";
import { readEnvironment, webEnvironmentSchema } from "@joint/contracts";
import { BffError } from "./responses";

type PrivacyPath =
  | `/v1/households/${string}/exports${string}`
  | `/v1/households/${string}/entitlements`
  | `/v1/me/archive/accounts${string}`
  | `/v1/me/archive/exports${string}`;
const allowed =
  /^\/v1\/(?:households\/[0-9a-f-]{36}\/(?:entitlements|exports(?:\/[0-9a-f-]{36}(?:\/download)?)?)|me\/archive\/(?:exports(?:\/[0-9a-f-]{36}(?:\/download)?)?|accounts(?:\/[0-9a-f-]{36}(?:\/transactions)?)?))$/i;

export async function privacyUpstream(
  path: PrivacyPath,
  token: string,
  options: {
    body?: object;
    query?: URLSearchParams;
    signal?: AbortSignal;
  } = {},
): Promise<Response> {
  if (!allowed.test(path))
    throw new BffError(
      400,
      "INVALID_INPUT",
      "This privacy action is unavailable.",
    );
  const environment = readEnvironment(webEnvironmentSchema, process.env);
  const url = new URL(path, environment.API_BASE_URL);
  if (options.query) url.search = options.query.toString();
  const response = await fetch(url, {
    method: options.body ? "POST" : "GET",
    headers: {
      Authorization: sessionAuthorization(token),
      Accept: path.endsWith("/download") ? "text/csv" : "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    cache: "no-store",
    redirect: "error",
    signal: options.signal ?? AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const value: unknown = await response.json().catch(() => null);
    const mfa =
      response.status === 403 &&
      typeof value === "object" &&
      value !== null &&
      "error" in value &&
      typeof value.error === "object" &&
      value.error !== null &&
      "code" in value.error &&
      (value.error.code === "MFA_REAUTH_REQUIRED" ||
        value.error.code === "MFA_REQUIRED");
    if (mfa)
      throw new BffError(
        403,
        "MFA_REAUTH_REQUIRED",
        "Verify a fresh authenticator code in Account security, then try again.",
      );
    const status = [400, 401, 403, 404, 409, 410, 422, 429].includes(
      response.status,
    )
      ? response.status
      : 503;
    throw new BffError(
      status,
      status === 401 ? "SIGN_IN_REQUIRED" : "PRIVACY_UNAVAILABLE",
      status === 401
        ? "Sign in again to continue."
        : "Access changed, or this export is unavailable or expired. Refresh your accounts and request a new export.",
    );
  }
  return response;
}
