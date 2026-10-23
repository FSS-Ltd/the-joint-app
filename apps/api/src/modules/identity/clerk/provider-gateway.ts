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
export class ClerkProviderUnavailable extends Error {}
export class ClerkProviderNotFound extends Error {}

/** Fixed provider origin and abortable requests; the SDK lacks per-call cancellation. */
export function createClerkGateway(
  environment: ClerkServerEnvironment,
): ClerkGateway {
  async function get(
    resource: "sessions" | "users",
    id: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    const response = await fetch(
      `https://api.clerk.com/v1/${resource}/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: `Bearer ${environment.CLERK_SECRET_KEY}`,
          Accept: "application/json",
        },
        signal,
        redirect: "error",
        cache: "no-store",
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 404) throw new ClerkProviderNotFound();
      throw new ClerkProviderUnavailable();
    }
    const reader = response.body?.getReader();
    if (!reader) throw new ClerkProviderUnavailable();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 65536) throw new ClerkProviderUnavailable();
        chunks.push(next.value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  }
  return {
    async session(id, signal) {
      const session = clerkProviderSessionSchema.parse(
        await get("sessions", id, signal),
      );
      return {
        id: session.id,
        userId: session.user_id,
        status: session.status,
        expiresAt: session.expire_at,
        hasPendingTask: (session.tasks?.length ?? 0) > 0,
        impersonating: session.actor !== null,
      };
    },
    async user(id, signal) {
      const user = clerkProviderUserSchema.parse(
        await get("users", id, signal),
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
