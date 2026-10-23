import {
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import {
  verifiedIdentitySchema,
  type VerifiedIdentity,
} from "@joint/contracts";

export class IdentityVerifier {
  private readonly keys;
  private readonly issuer: string;
  constructor(issuer: string) {
    this.issuer = issuer.replace(/\/$/, "");
    this.keys = createRemoteJWKSet(
      new URL(`${this.issuer}/.well-known/jwks.json`),
      {
        timeoutDuration: 2000,
        cooldownDuration: 30_000,
        cacheMaxAge: 300_000,
      },
    );
  }
  async verify(token: string): Promise<VerifiedIdentity> {
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: this.issuer,
        audience: "authenticated",
        algorithms: ["ES256", "RS256"],
        requiredClaims: ["sub", "exp", "session_id", "role"],
      });
      return verifiedIdentitySchema.parse(payload);
    } catch (error) {
      if (
        error instanceof TypeError ||
        error instanceof errors.JWKSTimeout ||
        error instanceof errors.JWKSInvalid ||
        (error instanceof errors.JOSEError && error.code === "ERR_JOSE_GENERIC")
      )
        throw new ServiceUnavailableException(
          "Identity verification unavailable",
        );
      throw new UnauthorizedException();
    }
  }
}
