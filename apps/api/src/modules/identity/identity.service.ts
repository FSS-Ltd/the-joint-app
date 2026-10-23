import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import {
  meResponseSchema,
  providerTokensSchema,
  type MeResponse,
} from "@joint/contracts";
import type { PrismaClient } from "@joint/database/client";
import type { AuthSession } from "@supabase/supabase-js";
import { AuthProvider } from "./auth-provider.js";
import { hashToken, IdentityVault } from "./identity-vault.js";
import type { IdentityPrincipal } from "./identity-context.js";
import { SessionStore, type BrowserIdentity } from "./session-store.js";

export class IdentityService {
  constructor(
    readonly sessions: SessionStore,
    private readonly provider: AuthProvider,
    private readonly database: PrismaClient,
    private readonly vault: IdentityVault,
  ) {}
  async signup(
    email: string,
    password: string,
  ): Promise<{ state: "VERIFY_EMAIL" }> {
    await this.provider.signup(email, password);
    return { state: "VERIFY_EMAIL" };
  }
  async login(
    email: string,
    password: string,
  ): Promise<{ state: string; browserToken: string }> {
    return this.register(await this.provider.login(email, password), "NORMAL");
  }
  async verify(
    email: string,
    code: string,
    type: "signup" | "recovery",
  ): Promise<{ state: string; browserToken: string }> {
    return this.register(
      await this.provider.verify(email, code, type),
      type === "recovery" ? "RECOVERY" : "NORMAL",
    );
  }
  async recovery(email: string): Promise<{ state: "VERIFY_EMAIL" }> {
    await this.provider.recovery(email);
    return { state: "VERIFY_EMAIL" };
  }
  async me(token: string): Promise<MeResponse> {
    return this.sessions.withSession(token, async (identity) => {
      const { principal, transaction } = identity;
      const member = await transaction.membership.findFirst({
        where: { userId: principal.userId, status: "ACTIVE" },
        include: {
          household: {
            include: {
              _count: {
                select: { memberships: { where: { status: "ACTIVE" } } },
              },
            },
          },
        },
      });
      const factors = await this.provider.factors(identity.tokens);
      return meResponseSchema.parse({
        user: { id: principal.userId, email: identity.user.email },
        membership: member
          ? {
              id: member.id,
              householdId: member.householdId,
              role: member.role,
              grantVersion: member.grantVersion,
              household: {
                id: member.household.id,
                name: member.household.name,
                baseCurrency: member.household.baseCurrency,
                timezone: member.household.timezone,
                memberCount: member.household._count.memberships,
              },
            }
          : null,
        session: {
          aal: principal.aal,
          expiresAt: identity.expiresAt.toISOString(),
          purpose: identity.purpose,
          needsMfa:
            principal.aal !== "aal2" &&
            factors.some((factor) => factor.status === "verified"),
        },
        factors: factors.map((factor) => ({
          ...factor,
          friendlyName: factor.friendlyName ?? "Authenticator",
        })),
      });
    });
  }
  async actor(token: string): Promise<IdentityPrincipal> {
    return this.sessions.withSession(token, async (identity) => {
      if (identity.purpose !== "NORMAL") throw new ForbiddenException();
      await this.requireMfaIfEnrolled(identity);
      return identity.principal;
    });
  }
  async enroll(
    token: string,
  ): Promise<{ factorId: string; qrCode: string; secret: string }> {
    return this.sessions.withSession(token, async (identity) => {
      if (identity.purpose !== "NORMAL") throw new ForbiddenException();
      await this.requireMfaIfEnrolled(identity);
      return this.provider.enroll(identity.tokens);
    });
  }
  async verifyMfa(
    token: string,
    factorId: string,
    code: string,
  ): Promise<{ state: "AUTHENTICATED" | "PASSWORD_RESET_REQUIRED" }> {
    return this.sessions.withSession(token, async (identity) => {
      const session = await this.provider.verifyMfa(
        identity.tokens,
        factorId,
        code,
      );
      await identity.saveTokens(session);
      await identity.transaction.auditEvent.create({
        data: { userId: identity.principal.userId, action: "MFA_VERIFIED" },
      });
      return {
        state:
          identity.purpose === "RECOVERY"
            ? "PASSWORD_RESET_REQUIRED"
            : "AUTHENTICATED",
      };
    });
  }
  async password(
    token: string,
    password: string,
  ): Promise<{ state: "AUTHENTICATED" }> {
    const result = await this.sessions.withSession(token, async (identity) => {
      if (
        identity.purpose !== "RECOVERY" ||
        !identity.principal.authenticatedAt ||
        Date.now() - identity.principal.authenticatedAt > 5 * 60_000
      )
        throw new ForbiddenException();
      await this.requireMfaIfEnrolled(identity);
      await this.provider.updatePassword(identity.tokens, password);
      await identity.transaction.sessionRegistry.updateMany({
        where: {
          userId: identity.principal.userId,
          id: { not: identity.principal.sessionId },
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          providerTokens: null,
          providerExpiresAt: null,
        },
      });
      await identity.transaction.sessionRegistry.update({
        where: { id: identity.principal.sessionId },
        data: { purpose: "NORMAL" },
      });
      await identity.transaction.auditEvent.create({
        data: { userId: identity.principal.userId, action: "PASSWORD_RESET" },
      });
      return {
        accessToken: identity.tokens.access_token,
        userId: identity.principal.userId,
      };
    });
    await this.providerLogout(result.accessToken, "others", result.userId);
    return { state: "AUTHENTICATED" };
  }
  async logout(
    token: string,
    scope: "local" | "global",
  ): Promise<{ state: "SIGNED_OUT" }> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException();
    const row = await this.database.sessionRegistry.findUnique({
      where: { browserTokenHash: hashToken(token) },
    });
    if (!row || row.kind !== "WEB") return { state: "SIGNED_OUT" };
    const access = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM app."User" WHERE id = ${row.userId}::uuid FOR UPDATE`;
      const current = await transaction.sessionRegistry.findUniqueOrThrow({
        where: { id: row.id },
      });
      if (
        current.revokedAt ||
        current.expiresAt.getTime() <= Date.now() ||
        current.userId !== row.userId
      )
        return undefined;
      let accessToken: string | undefined;
      if (current.providerTokens) {
        try {
          const stored = providerTokensSchema.parse(
            JSON.parse(
              this.vault.open(current.providerTokens, `session:${row.id}`),
            ),
          );
          accessToken = stored.access_token;
        } catch {
          await transaction.auditEvent.create({
            data: { userId: row.userId, action: "SESSION_STORAGE_UNAVAILABLE" },
          });
        }
      }
      await transaction.sessionRegistry.updateMany({
        where: {
          userId: row.userId,
          ...(scope === "local" ? { id: row.id } : {}),
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          providerTokens: null,
          providerExpiresAt: null,
        },
      });
      await transaction.auditEvent.create({
        data: {
          userId: row.userId,
          action: scope === "global" ? "LOGOUT_GLOBAL" : "LOGOUT_LOCAL",
        },
      });
      return accessToken;
    });
    if (access) await this.providerLogout(access, scope, row.userId);
    return { state: "SIGNED_OUT" };
  }
  private async register(
    session: AuthSession,
    purpose: "NORMAL" | "RECOVERY",
  ): Promise<{ state: string; browserToken: string }> {
    const browserToken = await this.sessions.register(session, purpose);
    const factors = await this.provider.factors(session);
    const state = factors.some((factor) => factor.status === "verified")
      ? "MFA_REQUIRED"
      : purpose === "RECOVERY"
        ? "PASSWORD_RESET_REQUIRED"
        : "AUTHENTICATED";
    return { state, browserToken };
  }
  private async requireMfaIfEnrolled(identity: BrowserIdentity): Promise<void> {
    if (
      identity.principal.aal !== "aal2" &&
      (await this.provider.factors(identity.tokens)).some(
        (factor) => factor.status === "verified",
      )
    )
      throw new ForbiddenException({
        error: {
          code: "MFA_REQUIRED",
          message: "Verify your authenticator before continuing.",
        },
      });
  }
  private async providerLogout(
    accessToken: string,
    scope: "local" | "global" | "others",
    userId: string,
  ): Promise<void> {
    try {
      await this.provider.signOut(accessToken, scope);
    } catch {
      // App access is already revoked. Record the provider failure without restoring it.
      await this.database.auditEvent.create({
        data: { userId, action: "PROVIDER_LOGOUT_UNAVAILABLE" },
      });
    }
  }
}
