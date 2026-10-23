import { UnauthorizedException } from "@nestjs/common";
import { databaseErrorCode } from "../../../database-error.js";
import type { ClerkLogoutContext } from "@joint/contracts";
import type { ClerkLogoutTicket } from "./logout-ticket.js";
import type { PrismaClient } from "@joint/database/client";
import type { ClerkCredentialVerifier } from "./credential-verifier.js";
import type { ClerkRevoker } from "./session-revoker.js";

export class ClerkLogout {
  constructor(
    private readonly database: PrismaClient,
    private readonly verifier: ClerkCredentialVerifier,
    private readonly provider: ClerkRevoker,
    private readonly timeoutMs: number,
    private readonly tickets: ClerkLogoutTicket,
  ) {}
  async logout(
    token: string,
    scope: "local" | "global",
  ): Promise<LogoutResult> {
    // Signature-only authority can revoke an existing mapping during provider outage; it cannot grant app access.
    const claims = await this.verifier.verifyClaims(token);
    const [row] = await this.database.$queryRaw<
      { userId: string; cutoffAt: Date }[]
    >`
      SELECT * FROM app.begin_clerk_logout(${claims.iss},${claims.sub},${claims.sid},${scope},${new Date(claims.exp * 1000)}::timestamptz)`.catch(
      (error: unknown) => {
        if (databaseErrorCode(error) === "42501")
          throw new UnauthorizedException();
        throw error;
      },
    );
    if (!row) return { state: "SIGNED_OUT" };
    return this.cleanup(
      {
        issuer: claims.iss,
        subject: claims.sub,
        sessionId: claims.sid,
        scope,
        cutoffAt: row.cutoffAt.getTime(),
      },
      row.userId,
    );
  }
  retry(ticket: string): Promise<LogoutResult> {
    return this.cleanup(this.tickets.read(ticket));
  }
  private async cleanup(
    context: ClerkLogoutContext,
    userId?: string,
  ): Promise<LogoutResult> {
    // Issue before remote calls; retries retain this immutable scope/cutoff and cannot renew the lifetime.
    const providerCleanupToken = this.tickets.issue(context);
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
        this.provider.revoke(
          context.subject,
          context.sessionId,
          context.scope,
          controller.signal,
          context.cutoffAt,
        ),
        deadline,
      ]);
      return { state: "SIGNED_OUT" };
    } catch {
      if (userId)
        await this.database.auditEvent.create({
          data: { userId, action: "PROVIDER_LOGOUT_UNAVAILABLE" },
        });
      return {
        state: "SIGNED_OUT",
        providerCleanupPending: true,
        providerCleanupToken,
      };
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
}

export interface LogoutResult {
  state: "SIGNED_OUT";
  providerCleanupPending?: boolean;
  providerCleanupToken?: string;
}
