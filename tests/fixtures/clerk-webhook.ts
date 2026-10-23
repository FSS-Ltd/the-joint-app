import { createHmac, randomUUID } from "node:crypto";

export function signedClerkWebhook(
  secret: string,
  event: unknown,
  options: { id?: string; timestamp?: number } = {},
): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify(event);
  const id = options.id ?? "msg_" + randomUUID().replaceAll("-", "");
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return {
    body,
    headers: {
      "Content-Type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(timestamp),
      "svix-signature": "v1," + signature,
    },
  };
}
