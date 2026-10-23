import type { PrismaClient } from "@joint/database/client";
import type { ClerkCredentialVerifier } from "./credential-verifier.js";
import type { ClerkRevoker } from "./session-revoker.js";

export class ClerkLogout {
  constructor(
    private readonly database: PrismaClient,
    private readonly verifier: ClerkCredentialVerifier,
    private readonly provider: ClerkRevoker,
    private readonly timeoutMs: number,
  ) {}
  async logout(
    token: string,
    scope: "local" | "global",
  ): Promise<{ state: "SIGNED_OUT"; providerCleanupPending?: boolean }> {
    // Signature-only authority can revoke an existing mapping during provider outage; it cannot grant app access.
    const claims = await this.verifier.verifyClaims(token);
    const [row] = await this.database.$queryRaw<
      { userId: string | null }[]
    >`SELECT app.revoke_clerk_session(${claims.iss},${claims.sub},${claims.sid},${scope === "global"},${new Date(claims.exp * 1000)}::timestamptz) AS "userId"`;
    if (!row?.userId) return { state: "SIGNED_OUT" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref();
    try {
      const deadline = new Promise<never>((_, reject) =>
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("Provider deadline")),
          { once: true },
        ),
      );
      await Promise.race([
        this.provider.revoke(claims.sub, claims.sid, scope, controller.signal),
        deadline,
      ]);
      return { state: "SIGNED_OUT" };
    } catch {
      await this.database.auditEvent.create({
        data: { userId: row.userId, action: "PROVIDER_LOGOUT_UNAVAILABLE" },
      });
      return { state: "SIGNED_OUT", providerCleanupPending: true };
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
}
