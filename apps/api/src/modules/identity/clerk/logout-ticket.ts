import { UnauthorizedException } from "@nestjs/common";
import {
  clerkLogoutContextSchema,
  type ClerkLogoutContext,
} from "@joint/contracts";
import type { IdentityVault } from "../identity-vault.js";

const purpose = "clerk-logout-cleanup-v1";
export const clerkLogoutTicketLifetimeMs = 1_800_000;

/** This capability can retry revocation only; it never authenticates application access. */
export class ClerkLogoutTicket {
  constructor(
    private readonly vault: IdentityVault,
    private readonly issuer: string,
  ) {}
  issue(context: ClerkLogoutContext): string {
    this.validate(context);
    return this.vault.seal(JSON.stringify(context), purpose);
  }
  read(ticket: string): ClerkLogoutContext {
    try {
      if (ticket.length > 4096) throw new Error();
      const context = clerkLogoutContextSchema.parse(
        JSON.parse(this.vault.open(ticket, purpose)),
      );
      this.validate(context);
      return context;
    } catch {
      throw new UnauthorizedException(
        "Sign-out cleanup expired. Sign in again to manage your sessions.",
      );
    }
  }
  private validate(context: ClerkLogoutContext): void {
    if (
      context.issuer !== this.issuer ||
      context.cutoffAt > Date.now() ||
      context.cutoffAt + clerkLogoutTicketLifetimeMs <= Date.now()
    )
      throw new UnauthorizedException();
  }
}
