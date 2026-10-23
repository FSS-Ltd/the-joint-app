import { UnauthorizedException } from "@nestjs/common";
import type { BootstrapResponse } from "@joint/contracts";
import type { PrismaClient } from "@joint/database/client";

import { IdentityVerifier } from "../identity/identity-verifier.js";

export interface BootstrapOptions {
  database: PrismaClient;
  issuer: string;
}
export class BootstrapService {
  private readonly verifier: IdentityVerifier;
  constructor(private readonly options: BootstrapOptions) {
    this.verifier = new IdentityVerifier(options.issuer);
  }
  async read(authorization: string | undefined): Promise<BootstrapResponse> {
    if (!authorization?.startsWith("Bearer ") || authorization.length > 16_384)
      throw new UnauthorizedException();
    const claims = await this.verifier.verify(authorization.slice(7));
    const session = await this.options.database.sessionRegistry.findFirst({
      where: {
        id: claims.session_id,
        userId: claims.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: "ACTIVE" },
        membership: { status: "ACTIVE" },
      },
      select: { householdId: true },
    });
    if (!session?.householdId) throw new UnauthorizedException();
    return { status: "ok", householdId: session.householdId };
  }
}
