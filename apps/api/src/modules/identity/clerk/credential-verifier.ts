import { createPublicKey } from "node:crypto";
import { verifyToken } from "@clerk/backend";
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  clerkSessionClaimsSchema,
  type ClerkServerEnvironment,
} from "@joint/contracts";
import {
  ClerkProviderNotFound,
  createClerkGateway,
  type ClerkGateway,
} from "./provider-gateway.js";
export type { ClerkGateway } from "./provider-gateway.js";

export interface ClerkCredential {
  issuer: string;
  subject: string;
  sessionId: string;
  email: string;
  expiresAt: number;
  mfaEnrolled: boolean;
  authenticatedAt: number | null;
  mfaAuthenticatedAt: number | null;
}

export class ClerkCredentialVerifier {
  constructor(
    private readonly environment: ClerkServerEnvironment,
    private readonly gateway: ClerkGateway = createClerkGateway(environment),
    private readonly publicKey: string = environment.CLERK_JWT_KEY,
  ) {
    try {
      const key = createPublicKey(publicKey);
      if (
        key.asymmetricKeyType !== "rsa" ||
        (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
      )
        throw new Error();
    } catch {
      throw new Error("Invalid environment fields: CLERK_JWT_KEY");
    }
  }

  async verify(token: string): Promise<ClerkCredential> {
    if (token.length > 16384 || token.split(".").length !== 3)
      throw new UnauthorizedException();
    let claims;
    try {
      claims = clerkSessionClaimsSchema.parse(
        await verifyToken(token, {
          jwtKey: this.publicKey,
          issuer: this.environment.CLERK_ISSUER,
          authorizedParties: this.environment.CLERK_AUTHORIZED_PARTIES,
          clockSkewInMs: 0,
        }),
      );
      if (
        claims.iss !== this.environment.CLERK_ISSUER ||
        !this.environment.CLERK_AUTHORIZED_PARTIES.includes(claims.azp) ||
        claims.iat > Date.now() / 1000
      )
        throw new UnauthorizedException();
    } catch {
      throw new UnauthorizedException();
    }
    const controller = new AbortController();
    const signal = controller.signal;
    const timer = setTimeout(
      () => controller.abort(),
      this.environment.CLERK_TIMEOUT_MS,
    );
    timer.unref();
    const deadline = new Promise<never>((_, reject) => {
      signal.addEventListener(
        "abort",
        () =>
          reject(new ServiceUnavailableException("Authentication unavailable")),
        { once: true },
      );
    });
    try {
      const [session, user] = await Promise.race([
        Promise.all([
          this.gateway.session(claims.sid, signal),
          this.gateway.user(claims.sub, signal),
        ]),
        deadline,
      ]);
      if (
        session.id !== claims.sid ||
        session.userId !== claims.sub ||
        session.status !== "active" ||
        session.hasPendingTask ||
        session.impersonating ||
        session.expiresAt <= Date.now() ||
        claims.exp * 1000 <= Date.now() ||
        user.id !== claims.sub ||
        !user.emailVerified ||
        !user.email ||
        user.blocked
      )
        throw new UnauthorizedException();
      const mfaEnrolled = user.mfaEnabled && user.totpEnabled;
      // fva is rounded down in minutes. Use the oldest possible verification instant.
      const factorTime = (age: number | undefined): number | null =>
        age === undefined || age < 0
          ? null
          : (claims.iat - (age + 1) * 60) * 1000;
      return {
        issuer: this.environment.CLERK_ISSUER,
        subject: claims.sub,
        sessionId: claims.sid,
        email: user.email,
        expiresAt: Math.min(claims.exp * 1000, session.expiresAt),
        mfaEnrolled,
        authenticatedAt: factorTime(claims.fva?.[0]),
        mfaAuthenticatedAt:
          mfaEnrolled && !user.otherSecondFactorsEnabled
            ? factorTime(claims.fva?.[1])
            : null,
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ClerkProviderNotFound
      )
        throw new UnauthorizedException();
      throw new ServiceUnavailableException("Authentication unavailable");
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
}
