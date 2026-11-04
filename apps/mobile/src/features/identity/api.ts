import { createNativeTransport } from "../../api/request";
import type { NativeSend } from "../../api/types";
import { NativeApiError as IdentityApiError } from "../../api/errors";
export {
  NativeApiError as IdentityApiError,
  nativeErrorMessage as identityError,
} from "../../api/errors";
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

export function createIdentityApi(
  baseUrl: string,
  getToken: () => Promise<string | null>,
  send?: NativeSend,
) {
  const transport = createNativeTransport(baseUrl, getToken, send);
  function request<T>(
    path: string,
    schema: { parse(value: unknown): T },
    signal: AbortSignal,
    body?: object,
    key?: string,
    cleanupTicket?: string,
  ): Promise<T> {
    return transport.request(path, schema, {
      method: body ? "POST" : "GET",
      signal,
      ...(body ? { body } : {}),
      ...(key ? { idempotencyKey: key } : {}),
      ...(cleanupTicket
        ? {
            authorization: {
              kind: "logout-cleanup",
              ticket: cleanupTicket,
            } as const,
          }
        : {}),
    });
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
