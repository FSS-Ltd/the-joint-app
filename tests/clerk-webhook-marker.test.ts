import { createHash, randomBytes } from "node:crypto";
import { expect, it } from "vitest";
import { verifyClerkWebhook } from "../apps/api/src/modules/identity/clerk/webhook-verifier.js";
import { signedClerkWebhook } from "./fixtures/clerk-webhook.js";

it("correlates only one marker from a signed user update", async () => {
  const secret = `whsec_${randomBytes(32).toString("base64")}`;
  const instanceId = "ins_marker";
  const marker = `JointMFA2.${randomBytes(32).toString("base64url")}`;
  async function verify(agent: string, type = "user.updated", enabled = true) {
    const signed = signedClerkWebhook(secret, {
      object: "event",
      instance_id: instanceId,
      timestamp: Date.now(),
      type,
      data: {
        id: "user_marker",
        totp_enabled: enabled,
        two_factor_enabled: enabled,
      },
      event_attributes: { http_request: { user_agent: agent } },
    });
    return verifyClerkWebhook(Buffer.from(signed.body), signed.headers, {
      signingSecret: secret,
      instanceId,
    });
  }
  expect((await verify(`mobile ${marker}`)).totpNonceHash).toBe(
    createHash("sha256").update(marker).digest("hex"),
  );
  expect((await verify(`${marker} ${marker}`)).totpNonceHash).toBeNull();
  expect((await verify(marker, "user.created")).totpNonceHash).toBeNull();
  expect(
    (await verify(marker, "user.updated", false)).totpNonceHash,
  ).toBeNull();
});
