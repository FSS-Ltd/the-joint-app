import { sessionDeadline } from "./session-activity.js";
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { providerTokensSchema, type ProviderTokens } from "@joint/contracts";
import type { PrismaClient, Prisma } from "@joint/database/client";
import type { AuthSession, AuthUser } from "@supabase/supabase-js";
import type { AuthProvider } from "./auth-provider.js";
import {
  principalFromClaims,
  type IdentityPrincipal,
} from "./identity-context.js";
import { IdentityVerifier } from "./identity-verifier.js";
import { hashToken, IdentityVault, newOpaqueToken } from "./identity-vault.js";

export interface BrowserIdentity {
  principal: IdentityPrincipal;
  user: AuthUser;
  tokens: ProviderTokens;
  expiresAt: Date;
  purpose: "NORMAL" | "RECOVERY";
  transaction: Prisma.TransactionClient;
  saveTokens(session: AuthSession): Promise<void>;
}
type Provider = Pick<AuthProvider, "refresh" | "getUser">;
const revoked = { rejected: true } as const;

export class SessionStore {
  constructor(
    private readonly database: PrismaClient,
    private readonly vault: IdentityVault,
    private readonly verifier: IdentityVerifier,
    private readonly provider: Provider,
  ) {}

  async register(
    session: AuthSession,
    purpose: "NORMAL" | "RECOVERY",
  ): Promise<string> {
    const claims = await this.verifier.verify(session.access_token);
    const user = await this.provider.getUser(session.access_token);
    if (user.id !== claims.sub || !user.email || !user.email_confirmed_at)
      throw new UnauthorizedException();
    const browserToken = newOpaqueToken();
    await this.database.$transaction(async (transaction) => {
      await transaction.user.upsert({
        where: { id: user.id },
        create: {
          id: user.id,
          emailHash: this.vault.emailHash(user.email ?? ""),
        },
        update: {},
      });
      const rows = await transaction.$queryRaw<{ status: string }[]>`
        SELECT status FROM app."User" WHERE id = ${user.id}::uuid FOR UPDATE`;
      if (rows[0]?.status !== "ACTIVE") throw new UnauthorizedException();
      if (
        await transaction.sessionRegistry.findUnique({
          where: { id: claims.session_id },
        })
      )
        throw new UnauthorizedException();
      const membership = await transaction.membership.findFirst({
        where: { userId: user.id, status: "ACTIVE" },
        select: { householdId: true },
      });
      await transaction.sessionRegistry.create({
        data: {
          id: claims.session_id,
          userId: user.id,
          householdId: membership?.householdId ?? null,
          kind: "WEB",
          purpose,
          browserTokenHash: hashToken(browserToken),
          providerTokens: this.encrypt(session, claims.session_id),
          providerExpiresAt: new Date(claims.exp * 1000),
          expiresAt: new Date(Date.now() + 7 * 86400_000),
        },
      });
      await transaction.auditEvent.create({
        data: { userId: user.id, action: "SESSION_CREATED" },
      });
    });
    return browserToken;
  }

  async withSession<T>(
    browserToken: string,
    action: (identity: BrowserIdentity) => Promise<T>,
  ): Promise<T> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(browserToken))
      throw new UnauthorizedException();
    const result = await this.database.$transaction(
      async (transaction) => {
        const rows = await transaction.$queryRaw<{ id: string }[]>`
        SELECT id FROM app."SessionRegistry" WHERE "browserTokenHash" = ${hashToken(browserToken)} FOR UPDATE`;
        const id = rows[0]?.id;
        if (!id) return revoked;
        const row = await transaction.sessionRegistry.findUnique({
          where: { id },
          include: { user: true, membership: true },
        });
        if (
          !row ||
          row.kind !== "WEB" ||
          row.revokedAt ||
          row.expiresAt.getTime() <= Date.now() ||
          row.user.status !== "ACTIVE" ||
          (row.householdId && row.membership?.status !== "ACTIVE")
        )
          return revoked;
        if (!row.providerTokens || !row.providerExpiresAt) return revoked;
        const deadline = await sessionDeadline(transaction, id);
        let tokens: ProviderTokens;
        try {
          tokens = providerTokensSchema.parse(
            JSON.parse(this.vault.open(row.providerTokens, `session:${id}`)),
          );
        } catch {
          throw new ServiceUnavailableException({
            error: {
              code: "SESSION_UNAVAILABLE",
              message: "Session unavailable. Sign in again or retry shortly.",
            },
          });
        }
        let identity: BrowserIdentity;
        try {
          if (row.providerExpiresAt.getTime() <= Date.now() + 60_000) {
            const refreshed = await this.provider.refresh(tokens.refresh_token);
            const claims = await this.verifier.verify(refreshed.access_token);
            if (claims.sub !== row.userId || claims.session_id !== id)
              throw new UnauthorizedException();
            tokens = providerTokensSchema.parse({
              access_token: refreshed.access_token,
              refresh_token: refreshed.refresh_token,
            });
            await transaction.sessionRegistry.update({
              where: { id },
              data: {
                providerTokens: this.encrypt(tokens, id),
                providerExpiresAt: new Date(claims.exp * 1000),
              },
            });
          }
          const claims = await this.verifier.verify(tokens.access_token);
          const user = await this.provider.getUser(tokens.access_token);
          if (
            claims.sub !== row.userId ||
            claims.session_id !== id ||
            user.id !== row.userId ||
            !user.email ||
            !user.email_confirmed_at
          )
            throw new UnauthorizedException();
          if (row.purpose !== "NORMAL" && row.purpose !== "RECOVERY")
            throw new UnauthorizedException();
          const principal = principalFromClaims(
            claims,
            this.vault.emailHash(user.email),
          );
          identity = {
            principal,
            user,
            tokens,
            expiresAt: new Date(deadline.expiresAt),
            purpose: row.purpose,
            transaction,
            saveTokens: async (session) => {
              const next = await this.verifier.verify(session.access_token);
              if (next.sub !== row.userId || next.session_id !== id)
                throw new UnauthorizedException();
              identity.tokens = providerTokensSchema.parse({
                access_token: session.access_token,
                refresh_token: session.refresh_token,
              });
              identity.principal = principalFromClaims(
                next,
                principal.emailHash,
              );
              await transaction.sessionRegistry.update({
                where: { id },
                data: {
                  providerTokens: this.encrypt(identity.tokens, id),
                  providerExpiresAt: new Date(next.exp * 1000),
                },
              });
            },
          };
        } catch (error) {
          if (!(error instanceof UnauthorizedException)) return { error };
          // Commit local revocation even when the provider rejects an otherwise unexpired JWT.
          await transaction.sessionRegistry.update({
            where: { id },
            data: {
              revokedAt: new Date(),
              providerTokens: null,
              providerExpiresAt: null,
            },
          });
          return revoked;
        }
        // A failed action must not undo a provider refresh that has already rotated tokens.
        await transaction.$executeRawUnsafe("SAVEPOINT identity_action");
        try {
          const value = await action(identity);
          await transaction.$executeRawUnsafe(
            "RELEASE SAVEPOINT identity_action",
          );
          return { value };
        } catch (error) {
          await transaction.$executeRawUnsafe(
            "ROLLBACK TO SAVEPOINT identity_action",
          );
          return { error };
        }
      },
      { maxWait: 5000, timeout: 20_000 },
    );
    if ("rejected" in result) throw new UnauthorizedException();
    if ("error" in result) throw result.error;
    return result.value;
  }

  private encrypt(tokens: ProviderTokens, sessionId: string): string {
    return this.vault.seal(
      JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      }),
      `session:${sessionId}`,
    );
  }
}
