import { NativeApiError } from "../../api/errors";
export { NativeApiError } from "../../api/errors";
const messages: Readonly<Record<string, string>> = {
  VERSION_CONFLICT:
    "This account changed. Reload its latest details before confirming again.",
  MFA_REQUIRED: "Verify an authenticator code before continuing.",
  MFA_REAUTH_REQUIRED:
    "Verify a fresh authenticator code before changing sharing.",
  SCOPE_REQUIRED: "Choose up to 50 accounts to view this summary.",
  INVALID_CURSOR:
    "Your account list changed. Return to the first page and try again.",
  IDEMPOTENCY_CONFLICT:
    "This request key was already used with different details. Reload before confirming a new request.",
  AUTHORITY_CHANGED: "Your account access changed. Reload before continuing.",
  RESOURCE_MISMATCH:
    "We could not verify these account details. Reload before continuing.",
};
export function financeErrorMessage(error: unknown): string {
  if (!(error instanceof NativeApiError))
    return "We could not complete this request. Please try again.";
  if (error.outcome === "uncertain")
    return "This change may have been saved. Check the latest account details before trying the same request again.";
  return (
    (error.code &&
      Object.hasOwn(messages, error.code) &&
      messages[error.code]) ||
    error.message
  );
}
export function needsFinanceReconciliation(error: unknown): boolean {
  return (
    error instanceof NativeApiError &&
    ((error.status === 403 &&
      error.code !== "MFA_REQUIRED" &&
      error.code !== "MFA_REAUTH_REQUIRED") ||
      error.status === 404 ||
      error.code === "AUTHORITY_CHANGED" ||
      error.code === "INVALID_CURSOR")
  );
}
