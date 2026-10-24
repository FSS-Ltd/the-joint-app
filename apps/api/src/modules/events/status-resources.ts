import { createHash } from "node:crypto";
import {
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { AuthContext, StatusSubscription } from "@joint/contracts";
import type { OwnerArchiveContext } from "@joint/database/archive";
import type { DeletionRepository } from "@joint/database/deletion";
import type { ImportQueries } from "../imports/import-queries.js";
import type { ExportService } from "../exports/export.service.js";
import type { IdentityAccess } from "../identity/identity.service.js";
import { hashToken } from "../identity/identity-vault.js";
import { readIdentityToken } from "../../identity-header.js";
import { financeContext, ownerArchiveContext } from "../../http-input.js";
import type { StatusSnapshot } from "./status-observer.js";

interface Services {
  identity: Pick<
    IdentityAccess,
    "financeContext" | "actor" | "subscriptionExpiry"
  >;
  imports?: Pick<ImportQueries, "observe">;
  exports?: Pick<ExportService, "status" | "archiveStatus">;
  deletions?: Pick<DeletionRepository, "status" | "statusDeadline">;
}
function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function future(...values: (string | null)[]): number | null {
  const times = values
    .filter((value): value is string => value !== null)
    .map(Date.parse)
    .filter((value) => Number.isFinite(value) && value > Date.now());
  return times.length ? Math.min(...times) : null;
}

/** Delegate every read to existing authority fences; only an opaque digest escapes. */
export class StatusResources {
  constructor(private readonly services: Services) {}

  async read(
    selector: StatusSubscription,
    auth: string | undefined,
  ): Promise<StatusSnapshot> {
    const { identity } = this.services;
    if (selector.kind === "deletion") {
      if (!auth || !/^Deletion [A-Za-z0-9_-]{43}$/.test(auth))
        throw new UnauthorizedException();
      if (!this.services.deletions) throw new ServiceUnavailableException();
      const hash = hashToken(auth.slice(9));
      const [status, deadline] = await Promise.all([
        this.services.deletions.status(selector.id, hash),
        this.services.deletions.statusDeadline(selector.id, hash),
      ]);
      if (!status || !deadline) throw new NotFoundException();
      return {
        fingerprint: fingerprint(status),
        credentialExpiresAt: deadline.getTime(),
        resourceExpiresAt: null,
        expiryEvent: "invalidate",
      };
    }
    const token = readIdentityToken(auth);
    if (selector.kind === "archive-export") {
      if (!this.services.exports) throw new ServiceUnavailableException();
      const context = await ownerArchiveContext(identity, auth);
      const status = await this.services.exports.archiveStatus(
        context,
        selector.id,
      );
      return this.snapshot(
        token,
        context,
        status,
        future(status.expiresAt, status.downloadExpiresAt),
      );
    }
    const context = await financeContext(identity, auth, selector.householdId);
    if (selector.kind === "import") {
      if (!this.services.imports) throw new ServiceUnavailableException();
      const snapshot = await this.services.imports.observe(
        context,
        selector.id,
      );
      return this.snapshot(token, context, snapshot.status, snapshot.expiresAt);
    }
    if (!this.services.exports) throw new ServiceUnavailableException();
    const status = await this.services.exports.status(context, selector.id);
    return this.snapshot(
      token,
      context,
      status,
      future(status.expiresAt, status.downloadExpiresAt),
    );
  }

  private async snapshot(
    token: string,
    context: AuthContext | OwnerArchiveContext,
    status: unknown,
    resourceExpiresAt: number | null,
  ): Promise<StatusSnapshot> {
    const authority = {
      userId: context.userId,
      sessionId: context.sessionId,
      aal: context.aal,
      mfaAuthenticatedAt: context.mfaAuthenticatedAt,
      householdId: "householdId" in context ? context.householdId : null,
      membershipId: "membershipId" in context ? context.membershipId : null,
      grantVersion: "grantVersion" in context ? context.grantVersion : null,
    };
    return {
      fingerprint: fingerprint({ status, authority }),
      credentialExpiresAt:
        await this.services.identity.subscriptionExpiry(token),
      resourceExpiresAt,
      expiryEvent: "renew",
    };
  }
}
