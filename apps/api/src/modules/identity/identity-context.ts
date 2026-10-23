import type { VerifiedIdentity } from "@joint/contracts";
/** Constructed by the identity guard from a verified provider identity and live registry. */
export interface IdentityPrincipal {
  userId: string;
  sessionId: string;
  emailHash: string;
  aal: "aal1" | "aal2";
  authenticatedAt: number | null;
  mfaAuthenticatedAt: number | null;
}
export function principalFromClaims(
  claims: VerifiedIdentity,
  emailHash: string,
): IdentityPrincipal {
  const methods = claims.amr ?? [];
  const totp = methods.filter((value) => value.method === "totp");
  return {
    userId: claims.sub,
    sessionId: claims.session_id,
    emailHash,
    aal: claims.aal,
    authenticatedAt: methods.length
      ? Math.max(...methods.map((value) => value.timestamp)) * 1000
      : null,
    mfaAuthenticatedAt: totp.length
      ? Math.max(...totp.map((value) => value.timestamp)) * 1000
      : null,
  };
}
