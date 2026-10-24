import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createApplication } from "../../apps/api/src/application.js";
import { StatusEventHub } from "../../apps/api/src/modules/events/status-hub.js";
import { createDatabaseNotifications } from "../../packages/database/src/notifications.js";
import { createOrm } from "../../packages/database/dist/client.js";
import { createFixtureOwner } from "./database.js";
import { createClerkFixture } from "./clerk.js";
import { meResponseSchema } from "../../packages/contracts/dist/index.js";

export async function createStatusFixture() {
  if (!process.env.DATABASE_URL)
    throw new Error("Status fixture requires runtime configuration");
  const database = createOrm(process.env.DATABASE_URL),
    owner = createFixtureOwner();
  const provider = await createClerkFixture();
  const hub = new StatusEventHub((callbacks) =>
    createDatabaseNotifications({
      topic: "status",
      connectionString: process.env.DATABASE_URL ?? "",
      timeoutMs: 1000,
      retryMaxMs: 1000,
      ...callbacks,
    }),
  );
  const app = await createApplication(
    { ready: async () => true, close: async () => {} },
    undefined,
    {
      provider: "clerk",
      database,
      environment: provider.environment,
      clerkGateway: provider.gateway,
      importKey: randomBytes(32).toString("base64"),
      events: hub,
    },
  );
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const householdId = randomUUID(),
    otherHouseholdId = randomUUID(),
    accountId = randomUUID(),
    batchId = randomUUID();
  const userIds: string[] = [];
  const actors = [];
  for (const slot of [1, 2, 3]) {
    const external = provider.account(true);
    const token = await provider.token(external.userId, external.sessionId);
    const response = await fetch(`${base}/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status !== 200)
      throw new Error("Fixture identity unavailable");
    const identity = meResponseSchema.parse(await response.json());
    userIds.push(identity.user.id);
    actors.push({
      external,
      token,
      userId: identity.user.id,
      membershipId: randomUUID(),
      householdId: slot === 3 ? otherHouseholdId : householdId,
      slot: slot === 2 ? 2 : 1,
    });
  }
  const actor = actors[0],
    partner = actors[1],
    outsider = actors[2];
  if (!actor || !partner || !outsider)
    throw new Error("Fixture actors unavailable");
  await owner.household.createMany({
    data: [{ id: householdId }, { id: otherHouseholdId }],
  });
  for (const person of actors) {
    await owner.membership.create({
      data: {
        id: person.membershipId,
        userId: person.userId,
        householdId: person.householdId,
        slot: person.slot,
      },
    });
    await owner.sessionRegistry.updateMany({
      where: { userId: person.userId },
      data: { householdId: person.householdId },
    });
  }
  await owner.account.create({
    data: {
      id: accountId,
      householdId,
      creatorUserId: actor.userId,
      creatorMembershipId: actor.membershipId,
      kind: "CURRENT",
      label: "Synthetic stream account",
      owners: {
        create: { userId: actor.userId, membershipId: actor.membershipId },
      },
      grants: {
        create: { membershipId: partner.membershipId, level: "TOTALS" },
      },
    },
  });
  await owner.importBatch.create({
    data: {
      id: batchId,
      householdId,
      accountId,
      requestedByUserId: actor.userId,
      requestedByMembershipId: actor.membershipId,
      fileChecksum: "a".repeat(64),
      mappingHash: "b".repeat(64),
      mapping: {},
      parserVersion: "1",
      previewExpiresAt: new Date(Date.now() + 60000),
    },
  });
  const receiptUserId = randomUUID(),
    receiptId = randomUUID(),
    receiptToken = randomBytes(32).toString("base64url");
  userIds.push(receiptUserId);
  await owner.user.create({ data: { id: receiptUserId } });
  await owner.deletionRequest.create({
    data: {
      id: receiptId,
      userId: receiptUserId,
      statusTokenHash: createHash("sha256").update(receiptToken).digest("hex"),
      statusExpiresAt: new Date(Date.now() + 60000),
    },
  });
  const url = (kind: string, id: string, household?: string) =>
    new URLSearchParams({
      kind,
      id,
      ...(household ? { householdId: household } : {}),
    }).toString();
  const actorAuthorization = `Bearer ${actor.token}`;
  async function request(
    query: string,
    auth = actorAuthorization,
    signal?: AbortSignal,
  ): Promise<Response> {
    return fetch(`${base}/v1/events?${query}`, {
      headers: { Authorization: auth },
      signal,
    });
  }
  async function close(): Promise<void> {
    await hub.close();
    await app.close();
    await owner.deletionRequest.deleteMany({
      where: { userId: receiptUserId },
    });
    await owner.exportChunk.deleteMany({
      where: {
        exportId: {
          in: (
            await owner.exportRequest.findMany({
              where: { householdId },
              select: { id: true },
            })
          ).map((row) => row.id),
        },
      },
    });
    await owner.exportRequest.deleteMany({ where: { householdId } });
    await owner.importBatch.deleteMany({ where: { householdId } });
    await owner.account.deleteMany({ where: { householdId } });
    await owner.$executeRaw`DELETE FROM app."ClerkSession" WHERE issuer=${provider.environment.CLERK_ISSUER}`;
    await owner.$executeRaw`DELETE FROM app."ClerkIdentity" WHERE issuer=${provider.environment.CLERK_ISSUER}`;
    await owner.sessionRegistry.deleteMany({
      where: { userId: { in: userIds } },
    });
    await owner.auditEvent.deleteMany({ where: { userId: { in: userIds } } });
    await owner.household.deleteMany({
      where: { id: { in: [householdId, otherHouseholdId] } },
    });
    await owner.user.deleteMany({ where: { id: { in: userIds } } });
    await database.$disconnect();
    await owner.$disconnect();
  }
  return {
    app,
    database,
    owner,
    provider,
    hub,
    base,
    actor,
    partner,
    outsider,
    householdId,
    otherHouseholdId,
    accountId,
    batchId,
    receiptId,
    receiptToken,
    receiptUserId,
    url,
    request,
    close,
  };
}

export function statusSignals(response: Response): {
  next(): Promise<string | null>;
  close(): Promise<void>;
} {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Fixture stream unavailable");
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    async next(): Promise<string | null> {
      for (;;) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (frame === ": keepalive") continue;
          return frame;
        }
        const chunk = await reader.read();
        if (chunk.done) return null;
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    },
    async close(): Promise<void> {
      await reader.cancel().catch(() => {});
    },
  };
}
