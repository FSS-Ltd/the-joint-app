import { verifyWebhook } from "@clerk/backend/webhooks";
import { BadRequestException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { clerkWebhookEnvelopeSchema } from "@joint/contracts";
export interface VerifiedClerkWebhook {
  eventId: string;
  payloadHash: string;
  type: string;
  resourceId: string;
  subject: string;
  timestamp: number;
  totpNonceHash: string | null;
}
export async function verifyClerkWebhook(
  body: unknown,
  headers: Record<string, string | string[] | undefined>,
  configuration: { signingSecret: string; instanceId: string },
): Promise<VerifiedClerkWebhook> {
  try {
    if (!Buffer.isBuffer(body) || body.length > 65536) throw new Error();
    const forwarded = new Headers();
    for (const key of ["svix-id", "svix-timestamp", "svix-signature"]) {
      const value = headers[key];
      if (typeof value !== "string" || value.length > 1024) throw new Error();
      forwarded.set(key, value);
    }
    const eventId = forwarded.get("svix-id") ?? "";
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(eventId)) throw new Error();
    const event = clerkWebhookEnvelopeSchema.parse(
      await verifyWebhook(
        new Request("http://localhost/v1/webhooks/clerk", {
          method: "POST",
          headers: forwarded,
          body: new Uint8Array(body),
        }),
        { signingSecret: configuration.signingSecret },
      ),
    );
    if (
      event.instance_id !== configuration.instanceId ||
      event.timestamp > Date.now() + 300000
    )
      throw new Error();
    const session = event.type.startsWith("session.");
    const subject = session ? event.data.user_id : event.data.id;
    if (!subject || !/^user_[A-Za-z0-9]{1,123}$/.test(subject))
      throw new Error();
    if (session && !/^sess_[A-Za-z0-9]{1,123}$/.test(event.data.id))
      throw new Error();
    const agent = event.event_attributes?.http_request?.user_agent ?? "";
    const markers = [
      ...agent.matchAll(/(?:^|\s)(JointMFA2\.[A-Za-z0-9_-]{43})(?=\s|$)/g),
    ];
    const marker =
      event.type === "user.updated" &&
      event.data.totp_enabled === true &&
      event.data.two_factor_enabled === true &&
      markers.length === 1
        ? markers[0]?.[1]
        : undefined;
    return {
      totpNonceHash: marker
        ? createHash("sha256").update(marker).digest("hex")
        : null,
      eventId,
      type: event.type,
      resourceId: event.data.id,
      subject,
      timestamp: event.timestamp,
      payloadHash: createHash("sha256").update(body).digest("hex"),
    };
  } catch {
    throw new BadRequestException("Webhook signature or payload is invalid.");
  }
}
