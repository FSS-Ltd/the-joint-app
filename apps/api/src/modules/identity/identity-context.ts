/** Constructed by the identity guard from a verified provider identity and live registry. */
export interface IdentityPrincipal {
  userId: string;
  sessionId: string;
  emailHash: string;
  aal: "aal1" | "aal2";
  authenticatedAt: number | null;
}
