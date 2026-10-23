import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createOrm } from "../packages/database/dist/client.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
import { HouseholdService } from "../apps/api/src/modules/households/households.service.js";
import type { IdentityPrincipal } from "../apps/api/src/modules/identity/identity-context.js";
const database = createOrm(
  process.env.DATABASE_URL ??
    "postgresql://joint:local-development-only@127.0.0.1:5432/joint",
);
const vault = new IdentityVault(
  randomBytes(32).toString("base64"),
  randomBytes(32).toString("base64"),
);
const service = new HouseholdService(database, vault);
const actors = Array.from({ length: 7 }, (_, index): IdentityPrincipal => ({
  userId: randomUUID(),
  sessionId: randomUUID(),
  emailHash: vault.emailHash(`adult-${index}@example.test`),
  aal: "aal2",
  authenticatedAt: Date.now(),
}));
const actor = (index: number): IdentityPrincipal => {
  const value = actors[index];
  if (!value) throw new Error("Unknown fixture actor");
  return value;
};
const households: string[] = [];
beforeAll(async () => {
  for (const value of actors) {
    await database.user.create({
      data: {
        id: value.userId,
        emailHash: value.emailHash,
        sessions: {
          create: {
            id: value.sessionId,
            expiresAt: new Date(Date.now() + 60_000),
          },
        },
      },
    });
  }
});
afterAll(async () => {
  await database.household.deleteMany({ where: { id: { in: households } } });
  const users = actors.map((value) => value.userId);
  await database.auditEvent.deleteMany({ where: { userId: { in: users } } });
  await database.requestKey.deleteMany({ where: { userId: { in: users } } });
  await database.sessionRegistry.deleteMany({
    where: { userId: { in: users } },
  });
  await database.user.deleteMany({ where: { id: { in: users } } });
  await database.$disconnect();
});
it("creates one household idempotently and rejects payload changes or a second active household", async () => {
  const key = randomUUID();
  const first = await service.create(actor(0), { name: "Synthetic home" }, key);
  households.push(first.id);
  expect(
    await service.create(actor(0), { name: "Synthetic home" }, key),
  ).toEqual(first);
  await expect(
    service.create(actor(0), { name: "Changed name" }, key),
  ).rejects.toThrow();
  await expect(
    service.create(actor(0), { name: "Another home" }, randomUUID()),
  ).rejects.toThrow();
  expect(
    await database.membership.count({
      where: { userId: actor(0).userId, status: "ACTIVE" },
    }),
  ).toBe(1);
});
it("binds a single-use seven-day invitation to the verified email and stores hashes only", async () => {
  const home = await service.create(
    actor(1),
    { name: "Another synthetic home" },
    randomUUID(),
  );
  households.push(home.id);
  const key = randomUUID();
  const invitation = await service.invite(
    actor(1),
    home.id,
    "adult-2@example.test",
    key,
  );
  expect(
    await service.invite(actor(1), home.id, "adult-2@example.test", key),
  ).toEqual(invitation);
  const stored = await database.invitation.findUniqueOrThrow({
    where: { id: invitation.id },
  });
  expect(stored.tokenHash).not.toBe(invitation.token);
  expect(JSON.stringify(stored)).not.toContain("adult-2@example.test");
  expect(
    stored.expiresAt.getTime() - stored.createdAt.getTime(),
  ).toBeGreaterThan(6.99 * 86400_000);
  await expect(
    service.acceptInvite(actor(3), invitation.token),
  ).rejects.toThrow();
  expect((await service.acceptInvite(actor(2), invitation.token)).id).toBe(
    home.id,
  );
  await expect(
    service.acceptInvite(actor(2), invitation.token),
  ).rejects.toThrow();
  await expect(
    service.invite(actor(1), home.id, "adult-3@example.test", randomUUID()),
  ).rejects.toThrow();
  await expect(
    service.invite(actor(2), home.id, "adult-3@example.test", randomUUID()),
  ).rejects.toThrow();
  expect(
    await database.membership.count({
      where: { householdId: home.id, status: "ACTIVE" },
    }),
  ).toBe(2);
});
it("rejects expired invitations and revoked sessions", async () => {
  const home = await service.create(
    actor(4),
    { name: "Expiry test" },
    randomUUID(),
  );
  households.push(home.id);
  const invite = await service.invite(
    actor(4),
    home.id,
    "adult-5@example.test",
    randomUUID(),
  );
  await database.invitation.update({
    where: { id: invite.id },
    data: { expiresAt: new Date(0) },
  });
  await expect(service.acceptInvite(actor(5), invite.token)).rejects.toThrow();
  await database.sessionRegistry.update({
    where: { id: actor(4).sessionId },
    data: { revokedAt: new Date() },
  });
  await expect(
    service.invite(actor(4), home.id, "adult-5@example.test", randomUUID()),
  ).rejects.toThrow();
});

it("serialises competing acceptances and enforces capacity and one active household in PostgreSQL", async () => {
  const householdId = households[0];
  const otherHouseholdId = households[2];
  if (!householdId || !otherHouseholdId)
    throw new Error("Missing fixture households");
  const tokens = [
    randomBytes(32).toString("base64url"),
    randomBytes(32).toString("base64url"),
  ];
  const candidates = [actor(3), actor(6)];
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const token = tokens[index];
    if (!candidate || !token) throw new Error("Missing fixture invitation");
    await database.invitation.create({
      data: {
        householdId,
        issuedByUserId: actor(0).userId,
        emailHash: candidate.emailHash,
        tokenHash: (
          await import("../apps/api/src/modules/identity/identity-vault.js")
        ).hashToken(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
  }
  const outcomes = await Promise.allSettled(
    candidates.map((candidate, index) =>
      service.acceptInvite(candidate, tokens[index] ?? ""),
    ),
  );
  expect(outcomes.filter((value) => value.status === "fulfilled")).toHaveLength(
    1,
  );
  expect(outcomes.filter((value) => value.status === "rejected")).toHaveLength(
    1,
  );
  expect(
    await database.membership.count({
      where: { householdId, status: "ACTIVE" },
    }),
  ).toBe(2);
  await expect(
    database.membership.create({
      data: { userId: actor(5).userId, householdId, slot: 3 },
    }),
  ).rejects.toThrow();
  await expect(
    database.membership.create({
      data: { userId: actor(0).userId, householdId: otherHouseholdId, slot: 2 },
    }),
  ).rejects.toThrow();
});
