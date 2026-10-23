import { ClerkSessionRejected } from "./rejected-session.js";
import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  meResponseSchema,
  type AuthContext,
  type MeResponse,
} from "@joint/contracts";
import { randomUUID } from "node:crypto";
import type { IdentityAccess } from "../identity.service.js";
import type { IdentityPrincipal } from "../identity-context.js";
import type { ClerkCredentialVerifier } from "./credential-verifier.js";
import type {
  ClerkIdentityContext,
  ClerkIdentityStore,
} from "./identity-store.js";
import type { ClerkLogout } from "./logout.service.js";
import type { ClerkTotpVerifier } from "./totp-verifier.js";

export class ClerkIdentityService implements IdentityAccess {
  constructor(
    private readonly verifier: ClerkCredentialVerifier,
    private readonly store: ClerkIdentityStore,
    private readonly signout: ClerkLogout,
    private readonly totp: ClerkTotpVerifier,
  ) {}
  private async withIdentity<T>(
    token: string,
    apply: (identity: ClerkIdentityContext) => Promise<T>,
  ): Promise<T> {
    try {
      const credential = await this.verifier.verify(token);
      return this.store.withCredential(credential, apply);
    } catch (error) {
      if (error instanceof ClerkSessionRejected)
        await this.store.revokeRejectedSession(error);
      throw error;
    }
  }
  me(token: string): Promise<MeResponse> {
    return this.withIdentity(
      token,
      async ({ principal, credential, transaction, expiresAt }) => {
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
        return meResponseSchema.parse({
          user: { id: principal.userId, email: credential.email },
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
            mfaVerifiedAt:
              principal.mfaAuthenticatedAt === null
                ? null
                : new Date(principal.mfaAuthenticatedAt).toISOString(),
            expiresAt: expiresAt.toISOString(),
            purpose: "NORMAL",
            needsMfa: credential.mfaEnrolled && principal.aal !== "aal2",
          },
          factors: credential.totpEnrolled
            ? [
                {
                  id: "clerk_totp",
                  friendlyName: "Authenticator",
                  status: "verified",
                },
              ]
            : [],
        });
      },
    );
  }
  actor(token: string): Promise<IdentityPrincipal> {
    return this.withIdentity(token, async (identity) => {
      requireMfa(identity);
      return identity.principal;
    });
  }
  financeContext(token: string, householdId: string): Promise<AuthContext> {
    return this.withIdentity(token, async (identity) => {
      requireMfa(identity);
      const member = await identity.transaction.membership.findFirst({
        where: { userId: identity.principal.userId, status: "ACTIVE" },
      });
      if (!member || member.householdId !== householdId)
        throw new NotFoundException();
      return {
        ...identity.principal,
        householdId,
        membershipId: member.id,
        grantVersion: member.grantVersion,
        requestId: randomUUID(),
      };
    });
  }
  logout(token: string, scope: "local" | "global") {
    return this.signout.logout(token, scope);
  }
  // Clerk's custom browser SDK owns these operations; never fall back to the legacy password provider.
  async signup(): Promise<never> {
    return providerFlowRequired();
  }
  async login(): Promise<never> {
    return providerFlowRequired();
  }
  async verify(): Promise<never> {
    return providerFlowRequired();
  }
  async recovery(): Promise<never> {
    return providerFlowRequired();
  }
  async enroll(): Promise<never> {
    return providerFlowRequired();
  }
  async verifyMfa(
    token: string,
    factorId: string,
    code: string,
  ): Promise<{ state: "AUTHENTICATED" }> {
    const credential = await this.verifier.verify(token);
    if (
      factorId !== "clerk_totp" ||
      !credential.totpEnrolled ||
      !/^\d{6}$/.test(code)
    )
      throw new ForbiddenException();
    // Both authoritative checks and the TOTP request happen outside database locks.
    const startedAt = Date.now();
    if (!(await this.totp.verify(credential.subject, code)))
      throw new ForbiddenException();
    const current = await this.verifier.verify(token);
    if (
      !current.totpEnrolled ||
      current.subject !== credential.subject ||
      current.sessionId !== credential.sessionId
    )
      throw new ForbiddenException();
    await this.store.recordTotp(current, startedAt);
    return { state: "AUTHENTICATED" };
  }
  async password(): Promise<never> {
    return providerFlowRequired();
  }
}
function requireMfa(identity: ClerkIdentityContext): void {
  if (identity.credential.mfaEnrolled && identity.principal.aal !== "aal2")
    throw new ForbiddenException({
      error: {
        code: "MFA_REQUIRED",
        message: "Verify your authenticator before continuing.",
      },
    });
}
function providerFlowRequired(): never {
  throw new ServiceUnavailableException("Use the configured sign-in flow.");
}
