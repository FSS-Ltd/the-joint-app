import { createClerkRequest } from "./provider-request.js";
import {
  clerkProviderSessionSchema,
  clerkProviderUserSchema,
  type ClerkServerEnvironment,
} from "@joint/contracts";

export interface ClerkSessionState {
  id: string;
  userId: string;
  status: string;
  expiresAt: number;
  createdAt: number;
  hasPendingTask: boolean;
  impersonating: boolean;
}
export interface ClerkUserState {
  id: string;
  email: string;
  emailVerified: boolean;
  blocked: boolean;
  totpEnabled: boolean;
  mfaEnabled: boolean;
  otherSecondFactorsEnabled: boolean;
}
export interface ClerkGateway {
  session(id: string, signal: AbortSignal): Promise<ClerkSessionState>;
  user(id: string, signal: AbortSignal): Promise<ClerkUserState>;
}
export {
  ClerkProviderUnavailable,
  ClerkProviderNotFound,
} from "./provider-request.js";

/** Fixed provider origin and abortable requests; the SDK lacks per-call cancellation. */
export function createClerkGateway(
  environment: ClerkServerEnvironment,
): ClerkGateway {
  const request = createClerkRequest(environment);
  return {
    async session(id, signal) {
      const session = clerkProviderSessionSchema.parse(
        await request(`/sessions/${encodeURIComponent(id)}`, "GET", signal),
      );
      return {
        id: session.id,
        userId: session.user_id,
        status: session.status,
        expiresAt: session.expire_at,
        createdAt: session.created_at,
        hasPendingTask: (session.tasks?.length ?? 0) > 0,
        impersonating: session.actor !== null,
      };
    },
    async user(id, signal) {
      const user = clerkProviderUserSchema.parse(
        await request(`/users/${encodeURIComponent(id)}`, "GET", signal),
      );
      const email = user.email_addresses.find(
        (value) => value.id === user.primary_email_address_id,
      );
      return {
        id: user.id,
        email: email?.email_address ?? "",
        emailVerified: email?.verification?.status === "verified",
        blocked: user.banned || user.locked,
        totpEnabled: user.totp_enabled,
        mfaEnabled: user.two_factor_enabled,
        otherSecondFactorsEnabled:
          user.backup_code_enabled ||
          user.phone_numbers.some((phone) => phone.reserved_for_second_factor),
      };
    },
  };
}
