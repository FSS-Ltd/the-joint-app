import { meResponseSchema, type MeResponse } from "@joint/contracts";
import type { AuthProvider } from "./auth-provider.js";
import type { BrowserIdentity } from "./session-store.js";

export async function readIdentity(
  identity: BrowserIdentity,
  provider: AuthProvider,
): Promise<MeResponse> {
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
  const factors = await provider.factors(identity.tokens);
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
      mfaVerifiedAt: principal.mfaAuthenticatedAt
        ? new Date(principal.mfaAuthenticatedAt).toISOString()
        : null,
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
}
