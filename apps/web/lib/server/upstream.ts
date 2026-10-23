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
  | `/v1/households/${string}/invitations`;
const allowedPath =
  /^\/v1\/(?:auth\/(?:signup|login|verify|recovery|password|logout|mfa\/(?:enroll|verify))|me|households(?:\/[0-9a-f-]{36}\/invitations)?|invitations\/accept)$/i;
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
  MFA_REQUIRED: "Verify your authenticator code to continue.",
  SESSION_UNAVAILABLE:
    "Your session is unavailable. Please sign in again or retry shortly.",
};

export async function upstream(
  path: Path,
  options: { body?: object; token?: string; idempotencyKey?: string } = {},
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
  if (options.token) headers.Authorization = `Session ${options.token}`;
  if (options.idempotencyKey)
    headers["Idempotency-Key"] = options.idempotencyKey;
  const response = await fetch(new URL(path, environment.API_BASE_URL), {
    method: options.body === undefined ? "GET" : "POST",
    headers,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    ...(options.body === undefined
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
