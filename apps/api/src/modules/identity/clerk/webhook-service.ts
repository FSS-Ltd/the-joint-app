import { ServiceUnavailableException } from "@nestjs/common";
import type { PrismaClient } from "@joint/database/client";
import {
  ClerkProviderNotFound,
  type ClerkGateway,
} from "./provider-gateway.js";
import type { VerifiedClerkWebhook } from "./webhook-verifier.js";

const supported = new Set([
  "user.created",
  "user.updated",
  "user.deleted",
  "session.created",
  "session.updated",
  "session.ended",
  "session.removed",
  "session.revoked",
]);
export class ClerkWebhookService {
  constructor(
    private readonly database: PrismaClient,
    private readonly issuer: string,
    private readonly gateway: ClerkGateway,
    private readonly timeoutMs: number,
  ) {}
  async apply(event: VerifiedClerkWebhook): Promise<void> {
    if (!supported.has(event.type)) return;
    let state: "ACTIVE" | "DISABLED" | "DELETED" | "REVOKED" = "ACTIVE";
    if (event.type === "user.deleted") state = "DELETED";
    else if (
      ["session.ended", "session.removed", "session.revoked"].includes(
        event.type,
      )
    )
      state = "REVOKED";
    else if (event.type.startsWith("user.")) {
      const signal = AbortSignal.timeout(this.timeoutMs);
      try {
        const deadline = new Promise<never>((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error()), {
            once: true,
          }),
        );
        const user = await Promise.race([
          this.gateway.user(event.subject, signal),
          deadline,
        ]);
        if (user.id !== event.subject) throw new Error();
        state = user.blocked ? "DISABLED" : "ACTIVE";
      } catch (error) {
        if (error instanceof ClerkProviderNotFound) state = "DELETED";
        else
          throw new ServiceUnavailableException(
            "Webhook reconciliation is unavailable.",
          );
      }
    }
    await this.database.$executeRaw`SELECT app.apply_clerk_webhook(
      ${this.issuer},${event.eventId},${event.payloadHash},${event.type},${event.resourceId},${event.subject},${new Date(event.timestamp)}::timestamptz,${state})`;
  }
}
