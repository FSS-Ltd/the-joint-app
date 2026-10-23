import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDatabase } from "../packages/database/dist/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { createApplication } from "../apps/api/src/application.js";
import { ClerkWebhookService } from "../apps/api/src/modules/identity/clerk/webhook-service.js";
import { createFixtureOwner } from "./fixtures/database.js";
import { createClerkFixture } from "./fixtures/clerk.js";
import { signedClerkWebhook } from "./fixtures/clerk-webhook.js";
import { meResponseSchema } from "../packages/contracts/src/identity.js";

void ClerkWebhookService;
if (!process.env.DATABASE_URL) throw new Error("Owned database required");
const fixture = await createClerkFixture();
const secret = "whsec_" + randomBytes(32).toString("base64");
const instance = "ins_" + randomUUID().replaceAll("-", "");
const owner = createFixtureOwner();
const database = createOrm(process.env.DATABASE_URL);
const connection = createDatabase(process.env.DATABASE_URL, 1000);
const app = await createApplication(connection, undefined, {
  provider: "clerk",
  database,
  environment: fixture.environment,
  clerkGateway: fixture.gateway,
  clerkWebhook: { signingSecret: secret, instanceId: instance },
});
let origin = "";
const users = new Set<string>();
beforeAll(async () => {
  await app.listen(0, "127.0.0.1");
  origin = await app.getUrl();
});
afterAll(async () => {
  await app.close();
  await connection.close();
  await owner.$executeRaw`DELETE FROM app."ClerkWebhookEvent" WHERE issuer=${fixture.environment.CLERK_ISSUER}`;
  await owner.$executeRaw`DELETE FROM app."ClerkResourceState" WHERE issuer=${fixture.environment.CLERK_ISSUER}`;
  await owner.$executeRaw`DELETE FROM app."ClerkSession" WHERE issuer=${fixture.environment.CLERK_ISSUER}`;
  await owner.$executeRaw`DELETE FROM app."ClerkIdentity" WHERE issuer=${fixture.environment.CLERK_ISSUER}`;
  await owner.auditEvent.deleteMany({ where: { userId: { in: [...users] } } });
  await owner.sessionRegistry.deleteMany({
    where: { userId: { in: [...users] } },
  });
  await owner.user.deleteMany({ where: { id: { in: [...users] } } });
  await database.$disconnect();
  await owner.$disconnect();
});
function event(type: string, id: string, subject = id) {
  return {
    object: "event",
    type,
    instance_id: instance,
    timestamp: Date.now(),
    data: { id, user_id: subject },
  };
}
function deliver(input: ReturnType<typeof signedClerkWebhook>) {
  return fetch(origin + "/v1/webhooks/clerk", { method: "POST", ...input });
}
async function me(person: ReturnType<typeof fixture.account>) {
  const response = await fetch(origin + "/v1/me", {
    headers: {
      Authorization:
        "Bearer " + (await fixture.token(person.userId, person.sessionId)),
    },
  });
  if (response.ok)
    users.add(meResponseSchema.parse(await response.clone().json()).user.id);
  return response;
}
it("accepts signed raw JSON once under concurrent delivery without retaining payloads", async () => {
  const person = fixture.account();
  const payload = {
    ...event("user.created", person.userId),
    ignored: "x".repeat(40000),
  };
  const signed = signedClerkWebhook(secret, payload);
  const responses = await Promise.all([
    deliver(signed),
    deliver(signed),
    deliver(signed),
  ]);
  expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
  const rows = await owner.$queryRaw<
    { eventId: string; payloadHash: string }[]
  >`SELECT "eventId","payloadHash" FROM app."ClerkWebhookEvent" WHERE issuer=${fixture.environment.CLERK_ISSUER}`;
  expect(
    rows.filter((r) => r.eventId === signed.headers["svix-id"]),
  ).toHaveLength(1);
  expect(rows[0]?.payloadHash).toMatch(/^[a-f0-9]{64}$/);
  expect((await me(person)).status).toBe(200);
});
it("rejects tampered, stale, foreign-instance and oversized deliveries safely", async () => {
  const person = fixture.account();
  const payload = event("user.deleted", person.userId);
  const signed = signedClerkWebhook(secret, payload);
  expect((await deliver({ ...signed, body: signed.body + " " })).status).toBe(
    400,
  );
  expect(
    (
      await deliver(
        signedClerkWebhook(secret, payload, {
          timestamp: Math.floor(Date.now() / 1000) - 600,
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await deliver(
        signedClerkWebhook(secret, { ...payload, instance_id: "ins_foreign" }),
      )
    ).status,
  ).toBe(400);
  const large = await deliver(
    signedClerkWebhook(secret, { ...payload, padding: "x".repeat(65536) }),
  );
  expect(large.status).toBe(413);
  expect(await large.text()).not.toContain(secret);
  expect((await me(person)).status).toBe(200);
});
it("a webhook-first user deletion prevents JIT and stale creates from resurrecting an identity", async () => {
  const person = fixture.account();
  expect(
    (
      await deliver(
        signedClerkWebhook(secret, event("user.deleted", person.userId)),
      )
    ).status,
  ).toBe(200);
  const stale = {
    ...event("user.created", person.userId),
    timestamp: Date.now() - 60000,
  };
  expect((await deliver(signedClerkWebhook(secret, stale))).status).toBe(200);
  expect((await me(person)).status).toBe(401);
});
it("JIT-first deletion revokes access without deleting application data", async () => {
  const person = fixture.account();
  const body = meResponseSchema.parse(await (await me(person)).json());
  expect(
    (
      await deliver(
        signedClerkWebhook(secret, event("user.deleted", person.userId)),
      )
    ).status,
  ).toBe(200);
  expect((await me(person)).status).toBe(401);
  expect(
    await owner.user.findUnique({ where: { id: body.user.id } }),
  ).not.toBeNull();
  expect(
    await owner.sessionRegistry.findFirst({
      where: { userId: body.user.id, revokedAt: null },
    }),
  ).toBeNull();
});
it("session tombstones win over reordered activation and do not revoke a different session", async () => {
  const person = fixture.account();
  expect(
    (
      await deliver(
        signedClerkWebhook(
          secret,
          event("session.revoked", person.sessionId, person.userId),
        ),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await deliver(
        signedClerkWebhook(
          secret,
          event("session.created", person.sessionId, person.userId),
        ),
      )
    ).status,
  ).toBe(200);
  expect((await me(person)).status).toBe(401);
  const old = fixture.sessions.get(person.sessionId);
  if (!old) throw Error("Missing synthetic session");
  const other = "sess_" + randomUUID().replaceAll("-", "");
  fixture.sessions.set(other, { ...old, id: other });
  expect((await me({ ...person, sessionId: other })).status).toBe(200);
});
it("reconciles user updates authoritatively and never applies household metadata grants", async () => {
  const person = fixture.account();
  const user = fixture.users.get(person.userId);
  if (!user) throw Error("Missing synthetic user");
  const prior = meResponseSchema.parse(await (await me(person)).json());
  user.blocked = true;
  const payload = {
    ...event("user.updated", person.userId),
    data: { id: person.userId, public_metadata: { role: "ADMIN" } },
  };
  expect((await deliver(signedClerkWebhook(secret, payload))).status).toBe(200);
  user.blocked = false;
  expect((await me(person)).status).toBe(401);
  expect(
    await owner.membership.findFirst({ where: { userId: prior.user.id } }),
  ).toBeNull();
});

it("serializes a deletion racing JIT so no live mapping survives the response", async () => {
  const person = fixture.account();
  const [delivery, access] = await Promise.all([
    deliver(signedClerkWebhook(secret, event("user.deleted", person.userId))),
    me(person),
  ]);
  expect(delivery.status).toBe(200);
  expect([200, 401]).toContain(access.status);
  expect((await me(person)).status).toBe(401);
});

it("denies runtime table access and reuse of an event ID for another payload", async () => {
  const person = fixture.account();
  const first = signedClerkWebhook(
    secret,
    event("session.revoked", person.sessionId, person.userId),
  );
  expect((await deliver(first)).status).toBe(200);
  const collision = signedClerkWebhook(
    secret,
    event("session.created", person.sessionId, person.userId),
    { id: first.headers["svix-id"] },
  );
  expect((await deliver(collision)).status).toBe(503);
  await expect(
    database.$queryRaw`SELECT * FROM app."ClerkResourceState"`,
  ).rejects.toBeDefined();
  await expect(
    database.$queryRaw`SELECT * FROM app."ClerkWebhookEvent"`,
  ).rejects.toBeDefined();
  expect((await me(person)).status).toBe(401);
});
