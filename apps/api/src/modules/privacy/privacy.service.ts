import { randomUUID } from "node:crypto";
import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import {
  deletionReceiptSchema,
  type DeletionReceipt,
  type DeletionStatus,
} from "@joint/contracts";
import type { OwnerArchiveContext } from "@joint/database/archive";
import type { DeletionRepository } from "@joint/database/deletion";
import type { PrivacyJournal } from "@joint/database/privacy-journal";
import { requireFreshMfa } from "../accounts/account-transaction.js";
import { hashToken, newOpaqueToken } from "../identity/identity-vault.js";

type Repository = Pick<DeletionRepository, "authorize" | "request" | "status">;
export class PrivacyService {
  constructor(
    private readonly repository: Repository,
    private readonly journal?: Pick<PrivacyJournal, "append">,
  ) {}

  async request(
    context: OwnerArchiveContext,
    requestId: string,
  ): Promise<DeletionReceipt> {
    requireFreshMfa(context);
    if (!this.journal)
      throw new ServiceUnavailableException({
        error: { code: "PRIVACY_UNAVAILABLE" },
      });
    await this.repository.authorize(context);
    const statusToken = newOpaqueToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000);
    await this.journal.append({
      version: 1,
      eventId: randomUUID(),
      requestId,
      userId: context.userId,
      kind: "DELETE_USER",
      recordedAt: new Date().toISOString(),
    });
    const status = await this.repository.request(
      context,
      requestId,
      hashToken(statusToken),
      expiresAt,
    );
    return deletionReceiptSchema.parse({
      id: status.id,
      state: status.state,
      statusToken,
      expiresAt: expiresAt.toISOString(),
    });
  }

  async status(id: string, statusToken: string): Promise<DeletionStatus> {
    const status = await this.repository.status(id, hashToken(statusToken));
    if (!status) throw new NotFoundException();
    return status;
  }
}
