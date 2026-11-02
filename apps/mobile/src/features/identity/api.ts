import {
  acceptInviteSchema,
  authResultSchema,
  householdCreateSchema,
  householdSummarySchema,
  idempotencyKeySchema,
  invitationCreatedSchema,
  inviteSchema,
  logoutSchema,
  meResponseSchema,
  mfaCodeSchema,
  sessionActivitySchema,
  sessionDeadlineSchema,
} from "@joint/contracts";

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
export class IdentityApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super(
      (code && messages[code]) ||
        (status === 401
          ? "Your session has ended. Sign in again."
          : status === 403
            ? "Your access has changed. Verify your account and try again."
            : "We could not complete this request. Check your connection and try again."),
    );
  }
}
export function identityError(error: unknown): string {
  return error instanceof IdentityApiError
    ? error.message
    : "We could not complete this request. Please try again.";
}
function errorCode(body: unknown): string | undefined {
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
export function createIdentityApi(
  baseUrl: string,
  getToken: () => Promise<string | null>,
  send: typeof fetch = fetch,
) {
  async function request<T>(
    path: string,
    schema: { parse(value: unknown): T },
    signal: AbortSignal,
    body?: object,
    key?: string,
    cleanupTicket?: string,
  ): Promise<T> {
    const abort = new AbortController();
    const cancel = () => abort.abort();
    signal.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(cancel, 15000);
    try {
      if (signal.aborted) throw new IdentityApiError(0);
      // Bound provider acquisition as well as the network request.
      const token = cleanupTicket
        ? null
        : await Promise.race([
            getToken(),
            new Promise<never>((_, reject) =>
              abort.signal.addEventListener(
                "abort",
                () => reject(new IdentityApiError(0)),
                { once: true },
              ),
            ),
          ]);
      if (abort.signal.aborted) throw new IdentityApiError(0);
      if (!cleanupTicket && !token) throw new IdentityApiError(401);
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (cleanupTicket) headers["X-Logout-Cleanup"] = cleanupTicket;
      if (body) headers["Content-Type"] = "application/json";
      if (key) headers["Idempotency-Key"] = idempotencyKeySchema.parse(key);
      const response = await send(`${baseUrl}/v1/${path}`, {
        method: body ? "POST" : "GET",
        headers,
        signal: abort.signal,
        redirect: "error",
        cache: "no-store",
        credentials: "omit",
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const value: unknown = await response.json().catch(() => {
        throw new IdentityApiError(response.ok ? 0 : response.status);
      });
      if (!response.ok)
        throw new IdentityApiError(response.status, errorCode(value));
      return schema.parse(value);
    } catch (error) {
      if (error instanceof IdentityApiError) throw error;
      throw new IdentityApiError(0);
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
    }
  }
  return {
    readMe: (signal: AbortSignal) => request("me", meResponseSchema, signal),
    readDeadline: (signal: AbortSignal) =>
      request("auth/session", sessionDeadlineSchema, signal),
    recordActivity: (activityAgeMs: number, signal: AbortSignal) =>
      request(
        "auth/session",
        sessionDeadlineSchema,
        signal,
        sessionActivitySchema.parse({ activityAgeMs }),
      ),
    verifyTotp: (code: string, signal: AbortSignal) =>
      request(
        "auth/mfa/verify",
        authResultSchema,
        signal,
        mfaCodeSchema.parse({ factorId: "clerk_totp", code }),
      ),
    createHousehold: (name: string, key: string, signal: AbortSignal) =>
      request(
        "households",
        householdSummarySchema,
        signal,
        householdCreateSchema.parse({ name }),
        key,
      ),
    invite: (
      householdId: string,
      email: string,
      key: string,
      signal: AbortSignal,
    ) =>
      request(
        `households/${idempotencyKeySchema.parse(householdId)}/invitations`,
        invitationCreatedSchema,
        signal,
        inviteSchema.parse({ email }),
        key,
      ),
    acceptInvitation: (token: string, signal: AbortSignal) =>
      request(
        "invitations/accept",
        householdSummarySchema,
        signal,
        acceptInviteSchema.parse({ token }),
      ),
    logout: (scope: "local" | "global", signal: AbortSignal) =>
      request(
        "auth/logout",
        authResultSchema,
        signal,
        logoutSchema.parse({ scope }),
      ),
    retryLogoutCleanup: (ticket: string, signal: AbortSignal) => {
      if (
        !/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(ticket) ||
        ticket.length > 4096
      )
        throw new IdentityApiError(401);
      return request(
        "auth/logout/retry",
        authResultSchema,
        signal,
        {},
        undefined,
        ticket,
      );
    },
  };
}
export type IdentityApi = ReturnType<typeof createIdentityApi>;
