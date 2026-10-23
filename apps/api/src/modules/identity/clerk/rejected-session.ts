import { UnauthorizedException } from "@nestjs/common";
import type { ClerkSessionClaims } from "@joint/contracts";

/** Trusted signature has been checked; these fields are never an HTTP response. */
export class ClerkSessionRejected extends UnauthorizedException {
  constructor(readonly claims: ClerkSessionClaims) {
    super();
  }
}
