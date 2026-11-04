const messages: Record<string, string> = {
  INVITATION_UNAVAILABLE:
    "This invitation has expired or belongs to another verified email. Ask the organiser for a new invitation.",
  HOUSEHOLD_FULL: "This household already has two adults.",
  HOUSEHOLD_EXISTS:
    "You already belong to a household. Refresh your account to continue.",
  INVITE_SELF: "Invite the other adult using their own email address.",
  ADMIN_REQUIRED: "Only the household organiser can invite another adult.",
  MFA_REQUIRED: "Verify a fresh authenticator code before continuing.",
  MFA_INVALID: "That authenticator code did not match. Try the next code.",
};
export class NativeApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
    readonly outcome: "rejected" | "uncertain" = "rejected",
  ) {
    super(
      (code && Object.hasOwn(messages, code) && messages[code]) ||
        (status === 401
          ? "Your session has ended. Sign in again."
          : status === 403
            ? "Your access has changed. Verify your account and try again."
            : "We could not complete this request. Check your connection and try again."),
    );
  }
}
export function nativeErrorMessage(error: unknown): string {
  return error instanceof NativeApiError
    ? error.message
    : "We could not complete this request. Please try again.";
}
export function errorCode(body: unknown): string | undefined {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "code" in body.error &&
    typeof body.error.code === "string"
  )
    return body.error.code;
  return undefined;
}
