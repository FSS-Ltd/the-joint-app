import { ClerkSessionRejected } from "./rejected-session.js";
import { createPublicKey } from "node:crypto";
import { verifyToken } from "@clerk/backend";
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  clerkApiBearerSessionClaimsSchema,
  clerkSessionClaimsSchema,
  clerkSessionFactsSchema,
  type ClerkServerEnvironment,
  type ClerkSessionFacts,
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
  sessionExpiresAt: number;
  sessionCreatedAt: number;
  mfaEnrolled: boolean;
  totpEnrolled: boolean;
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

  async verifyClaims(token: string): Promise<ClerkSessionFacts> {
    if (token.length > 16384 || token.split(".").length !== 3)
      throw new UnauthorizedException();
    try {
      const verified = await verifyToken(token, {
        jwtKey: this.publicKey,
        issuer: this.environment.CLERK_ISSUER,
        clockSkewInMs: 0,
      });
      // Select only from signed claims. A present azp can never use the API exemption.
      if (Object.hasOwn(verified, "azp")) {
        const web = clerkSessionClaimsSchema.parse(verified);
        if (!this.environment.CLERK_AUTHORIZED_PARTIES.includes(web.azp))
          throw new UnauthorizedException();
      } else {
        const api = clerkApiBearerSessionClaimsSchema.parse(verified);
        if (
          !this.environment.CLERK_API_BEARER_AUDIENCE ||
          api.aud !== this.environment.CLERK_API_BEARER_AUDIENCE
        )
          throw new UnauthorizedException();
      }
      // Downstream registry and logout operations receive only common session facts.
      const claims = clerkSessionFactsSchema.parse(verified);
      if (
        claims.iss !== this.environment.CLERK_ISSUER ||
        claims.iat > Date.now() / 1000
      )
        throw new UnauthorizedException();
      return claims;
    } catch {
      throw new UnauthorizedException();
    }
  }

  async verify(token: string): Promise<ClerkCredential> {
    const claims = await this.verifyClaims(token);
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
          this.gateway
            .session(claims.sid, signal)
            .then((session) => {
              if (
                [
                  "revoked",
                  "ended",
                  "abandoned",
                  "expired",
                  "removed",
                ].includes(session.status)
              )
                throw new ClerkSessionRejected(claims);
              return session;
            })
            .catch((error) => {
              if (error instanceof ClerkProviderNotFound)
                throw new ClerkSessionRejected(claims);
              throw error;
            }),
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
      const mfaEnrolled = user.mfaEnabled || user.totpEnabled;
      const totpEnrolled = user.mfaEnabled && user.totpEnabled;
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
        sessionExpiresAt: session.expiresAt,
        sessionCreatedAt: session.createdAt,
        mfaEnrolled,
        totpEnrolled,
        authenticatedAt: factorTime(claims.fva?.[0]),
        mfaAuthenticatedAt:
          totpEnrolled && !user.otherSecondFactorsEnabled
            ? factorTime(claims.fva?.[1])
            : null,
      };
    } catch (error) {
      if (error instanceof ClerkSessionRejected) throw error;
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
