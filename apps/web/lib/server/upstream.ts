import { readEnvironment, webEnvironmentSchema } from "@joint/contracts";
import { BffError } from "./responses";

type Path =
  | "/v1/auth/signup"
  | "/v1/auth/login"
  | "/v1/auth/verify"
  | "/v1/auth/recovery"
  | "/v1/auth/password"
  | "/v1/auth/mfa/enroll"
  | "/v1/auth/mfa/verify"
  | "/v1/auth/logout"
  | "/v1/me"
  | "/v1/households"
  | "/v1/invitations/accept"
  | `/v1/households/${string}/invitations`
  | `/v1/households/${string}/accounts`
  | `/v1/households/${string}/accounts/${string}`
  | `/v1/households/${string}/imports`
  | `/v1/households/${string}/imports/${string}`
  | `/v1/households/${string}/transactions`
  | `/v1/households/${string}/transactions/${string}`;
const allowedPath =
  /^\/v1\/(?:auth\/(?:signup|login|verify|recovery|password|logout|mfa\/(?:enroll|verify))|me|households(?:\/[0-9a-f-]{36}\/(?:invitations|accounts(?:\/[0-9a-f-]{36}(?:\/(?:valuations|grants\/[0-9a-f-]{36}))?)?|imports(?:\/(?:inspect|preview|[0-9a-f-]{36}(?:\/(?:rows|review|commit|original))?))?|transactions(?:\/[0-9a-f-]{36}(?:\/annotation)?)?))?|invitations\/accept)$/i;
const safeErrors: Record<string, string> = {
  INVITATION_UNAVAILABLE:
    "This invitation is unavailable. Ask your household admin for a new link.",
  ADMIN_REQUIRED: "Only the household admin can create an invitation.",
  INVITE_SELF:
    "Choose the email address of the other person in your household.",
  HOUSEHOLD_FULL: "This household already has two members.",
  HOUSEHOLD_EXISTS: "You already belong to a household.",
  IDEMPOTENCY_CONFLICT:
    "These details changed. Please try again with a new request.",
  MFA_REAUTH_REQUIRED:
    "Verify a fresh authenticator code before sharing more access.",
  VERSION_CONFLICT:
    "This record changed in another tab. Reload it and try again.",
  MFA_REQUIRED: "Verify your authenticator code to continue.",
  IMPORT_REVIEW_REQUIRED:
    "Choose Keep or Skip for every overlap before committing.",
  IMPORT_REJECTS_UNCONFIRMED:
    "Acknowledge rejected rows before committing the valid rows.",
  IMPORT_PROTECTED:
    "This import has later changes or notes and cannot be rolled back.",
  IMPORT_BUSY:
    "Another import is still being committed. Wait for it to finish before trying again.",
  IMPORT_EXPIRED: "This preview expired. Inspect and upload the file again.",
  PREVIEW_STALE:
    "Activity changed after this preview. Inspect and upload the file again before committing.",
  CSV_INVALID_MAPPING:
    "Choose valid columns and explicit date and amount conventions.",
  IMPORT_NOT_READY:
    "This import is not ready for that action. Refresh its progress and try again.",
  ORIGINAL_UNAVAILABLE: "The retained original is no longer available.",
  CSV_INVALID_FORMAT:
    "The CSV could not be read. Check its quoting and column separators.",
  CSV_INVALID_ENCODING:
    "Save this CSV using UTF-8 encoding, then inspect it again.",
  CSV_INVALID_HEADERS:
    "Use a non-empty header row with a name for each column.",
  CSV_RECORD_TOO_LARGE:
    "A CSV row is too large. Shorten it before trying again.",
  CSV_TOO_MANY_COLUMNS: "Use a CSV with no more than 100 columns.",
  CSV_TOO_MANY_ROWS: "Use a CSV with no more than 50,000 data rows.",
  CSV_TOO_LARGE: "Choose a CSV file of 10 MiB or less.",
  CSV_EMPTY: "Choose a CSV file with a header and at least one data row.",
  SESSION_UNAVAILABLE:
    "Your session is unavailable. Please sign in again or retry shortly.",
};

export async function upstream(
  path: Path,
  options: {
    body?: object;
    token?: string;
    idempotencyKey?: string;
    method?: "PATCH" | "PUT" | "DELETE";
    csv?: { bytes: ArrayBuffer; accountId: string; mapping?: string };
    ifMatch?: string;
    query?: URLSearchParams;
  } = {},
): Promise<unknown> {
  if (!allowedPath.test(path))
    throw new BffError(
      503,
      "UNAVAILABLE",
      "This service is unavailable. Please try again shortly.",
    );
  const environment = readEnvironment(webEnvironmentSchema, process.env);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.csv) {
    headers["Content-Type"] = "text/csv; charset=UTF-8";
    headers["X-Account-Id"] = options.csv.accountId;
    if (options.csv.mapping) headers["X-Import-Mapping"] = options.csv.mapping;
  }
  if (options.token) headers.Authorization = `Session ${options.token}`;
  if (options.idempotencyKey)
    headers["Idempotency-Key"] = options.idempotencyKey;
  if (options.ifMatch) headers["If-Match"] = options.ifMatch;
  const url = new URL(path, environment.API_BASE_URL);
  if (options.query) url.search = options.query.toString();
  const response = await fetch(url, {
    method:
      options.method ??
      (options.body === undefined && !options.csv ? "GET" : "POST"),
    headers,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    ...(options.csv
      ? { body: options.csv.bytes }
      : options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const code =
      typeof value === "object" &&
      value !== null &&
      "error" in value &&
      typeof value.error === "object" &&
      value.error !== null &&
      "code" in value.error &&
      typeof value.error.code === "string"
        ? value.error.code
        : "";
    const knownMessage = safeErrors[code];
    const status = [400, 401, 403, 404, 409, 422, 429].includes(response.status)
      ? response.status
      : 503;
    const message =
      knownMessage ??
      (status === 401
        ? "Sign-in failed or your session has expired. Check your details and try again."
        : status === 429
          ? "Too many requests. Please wait a moment and try again."
          : status === 503
            ? "This service is unavailable. Please try again shortly."
            : "This request could not be completed. Check your details and try again.");
    throw new BffError(
      status,
      knownMessage ? code : status === 401 ? "UNAUTHORIZED" : "REQUEST_FAILED",
      message,
    );
  }
  return value;
}
