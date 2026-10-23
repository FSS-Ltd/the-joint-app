import { UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { identityClaimsSchema } from "@joint/contracts";
import type { BootstrapResponse } from "@joint/contracts";
import type { PrismaClient } from "@joint/database/client";

export interface BootstrapOptions {
  database: PrismaClient;
  issuer: string;
}
export class BootstrapService {
  private readonly keys;
  private readonly issuer: string;
  constructor(private readonly options: BootstrapOptions) {
    this.issuer = options.issuer.replace(/\/$/, "");
    this.keys = createRemoteJWKSet(
      new URL(`${this.issuer}/.well-known/jwks.json`),
      { timeoutDuration: 2000, cooldownDuration: 30_000, cacheMaxAge: 300_000 },
    );
  }
  async read(authorization: string | undefined): Promise<BootstrapResponse> {
    if (!authorization?.startsWith("Bearer ") || authorization.length > 16_384)
      throw new UnauthorizedException();
    const claims = await this.verify(authorization.slice(7));
    const session = await this.options.database.sessionRegistry.findFirst({
      where: {
        id: claims.session_id,
        userId: claims.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { householdId: true },
    });
    if (!session) throw new UnauthorizedException();
    return { status: "ok", householdId: session.householdId };
  }
  private async verify(
    token: string,
  ): Promise<{ sub: string; session_id: string }> {
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: this.issuer,
        audience: "authenticated",
        algorithms: ["ES256", "RS256"],
        requiredClaims: ["sub", "exp", "session_id", "role"],
      });
      return identityClaimsSchema.parse(payload);
    } catch {
      throw new UnauthorizedException();
    }
  }
}
