import { ForbiddenException } from "@nestjs/common";
import type { IdentityPrincipal } from "../identity-context.js";
import type { ClerkCredentialVerifier } from "./credential-verifier.js";
import type { ClerkIdentityStore } from "./identity-store.js";
import type { ClerkTotpVerifier } from "./totp-verifier.js";

interface LegacyProofReader {
  withSession<T>(
    token: string,
    apply: (context: { principal: IdentityPrincipal }) => Promise<T>,
  ): Promise<T>;
}
/** Two independently verified identities; matching email alone is never authority. */
export class ClerkLegacyLinker {
  constructor(
    private readonly verifier: Pick<ClerkCredentialVerifier, "verify">,
    private readonly totp: ClerkTotpVerifier,
    private readonly legacy: LegacyProofReader,
    private readonly store: Pick<
      ClerkIdentityStore,
      "bindLegacy" | "recordTotp"
    >,
  ) {}
  async link(
    token: string,
    legacyToken: string,
    code: string,
  ): Promise<{ state: "AUTHENTICATED" }> {
    const credential = await this.verifier.verify(token);
    if (!credential.totpEnrolled || !/^\d{6}$/.test(code))
      throw new ForbiddenException();
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
    // Release the legacy transaction before taking the binding's actor lock.
    const legacy = await this.legacy.withSession(
      legacyToken,
      async ({ principal }) => principal,
    );
    await this.store.bindLegacy(legacy, {
      ...current,
      mfaAuthenticatedAt: startedAt,
    });
    await this.store.recordTotp(current, startedAt);
    return { state: "AUTHENTICATED" };
  }
}
