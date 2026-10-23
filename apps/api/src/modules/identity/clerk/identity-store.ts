import type { ClerkSessionRejected } from "./rejected-session.js";
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Prisma, PrismaClient } from "@joint/database/client";
import type { IdentityVault } from "../identity-vault.js";
import type { IdentityPrincipal } from "../identity-context.js";
import type { ClerkCredential } from "./credential-verifier.js";
import { databaseErrorCode } from "../../../database-error.js";

export interface ClerkIdentityContext {
  principal: IdentityPrincipal;
  credential: ClerkCredential;
  transaction: Prisma.TransactionClient;
  expiresAt: Date;
  mfaRequired: boolean;
}
interface MappingRow {
  userId: string;
  sessionId: string;
  expiresAt: Date;
  totpVerifiedAt: Date | null;
}

/** Accept only a credential returned by the verifier, never a request body. */
export class ClerkIdentityStore {
  constructor(
    private readonly database: PrismaClient,
    private readonly vault: IdentityVault,
  ) {}

  async withCredential<T>(
    credential: ClerkCredential,
    apply: (context: ClerkIdentityContext) => Promise<T>,
  ): Promise<T> {
    if (credential.expiresAt <= Date.now()) throw new UnauthorizedException();
    try {
      // Keep an observed MFA requirement even if the later protected operation is denied.
      await this.database
        .$queryRaw`SELECT app.clerk_mfa_requirement(${credential.issuer},${credential.subject},${credential.mfaEnrolled})`;
      return await this.database.$transaction(async (transaction) => {
        const [row] = await transaction.$queryRaw<
          MappingRow[]
        >`SELECT mapped.*,app.clerk_totp_proof(${credential.issuer},${credential.sessionId}) AS "totpVerifiedAt" FROM app.resolve_clerk_identity(
          ${credential.issuer},${credential.subject},${credential.sessionId},${this.vault.emailHash(credential.email)},
          ${new Date(credential.expiresAt)}::timestamptz,${new Date(credential.sessionExpiresAt)}::timestamptz,${new Date(credential.sessionCreatedAt)}::timestamptz) mapped`;
        if (!row) throw new UnauthorizedException();
        const [requirement] = await transaction.$queryRaw<
          { required: boolean }[]
        >`SELECT app.clerk_mfa_requirement(${credential.issuer},${credential.subject},${credential.mfaEnrolled}) AS required`;
        if (!requirement) throw new UnauthorizedException();
        const localProof = credential.totpEnrolled
          ? (row.totpVerifiedAt?.getTime() ?? null)
          : null;
        const proof = [credential.mfaAuthenticatedAt, localProof].reduce<
          number | null
        >(
          (latest, value) =>
            value !== null &&
            value <= Date.now() &&
            (latest === null || value > latest)
              ? value
              : latest,
          null,
        );
        return apply({
          credential,
          mfaRequired: requirement.required,
          transaction,
          expiresAt: row.expiresAt,
          principal: {
            userId: row.userId,
            sessionId: row.sessionId,
            emailHash: this.vault.emailHash(credential.email),
            aal: proof === null ? "aal1" : "aal2",
            authenticatedAt: credential.authenticatedAt,
            mfaAuthenticatedAt: proof,
          },
        });
      });
    } catch (error) {
      throw mapError(error);
    }
  }

  async recordTotp(
    credential: ClerkCredential,
    verifiedAt: number,
  ): Promise<void> {
    await this.withCredential(credential, async ({ transaction }) => {
      await transaction.$executeRaw`SELECT app.record_clerk_totp(${credential.issuer},${credential.subject},${credential.sessionId},${new Date(verifiedAt)}::timestamptz)`;
    });
  }

  async revokeRejectedSession(error: ClerkSessionRejected): Promise<void> {
    const claims = error.claims;
    await this.database
      .$executeRaw`SELECT app.revoke_clerk_session(${claims.iss},${claims.sub},${claims.sid},false,${new Date(claims.exp * 1000)}::timestamptz,'PROVIDER_SESSION_REVOKED')`;
  }

  async bindLegacy(
    legacy: IdentityPrincipal,
    credential: ClerkCredential,
  ): Promise<void> {
    const fresh = (value: number | null): boolean =>
      value !== null && value <= Date.now() && value >= Date.now() - 300_000;
    if (
      legacy.aal !== "aal2" ||
      !fresh(legacy.mfaAuthenticatedAt) ||
      !fresh(credential.mfaAuthenticatedAt)
    )
      throw new ForbiddenException();
    if (credential.expiresAt <= Date.now()) throw new UnauthorizedException();
    try {
      await this.database.$executeRaw`SELECT app.bind_clerk_identity(
        ${credential.issuer},${credential.subject},${this.vault.emailHash(credential.email)},
        ${legacy.userId}::uuid,${legacy.sessionId}::uuid,
        ${new Date(legacy.mfaAuthenticatedAt ?? 0)}::timestamptz,${new Date(credential.mfaAuthenticatedAt ?? 0)}::timestamptz,${new Date(credential.expiresAt)}::timestamptz)`;
    } catch (error) {
      throw mapError(error);
    }
  }
}
function mapError(error: unknown): unknown {
  const code = databaseErrorCode(error);
  if (code === "42501") return new UnauthorizedException();
  if (code === "P0001")
    return new ConflictException({
      error: {
        code: "IDENTITY_MIGRATION_REQUIRED",
        message: "Verify your existing account before linking this sign-in.",
      },
    });
  return error;
}
