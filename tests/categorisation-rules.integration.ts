import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthContext } from "../packages/contracts/dist/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { ScopedDatabase } from "../packages/database/dist/scoped-transaction.js";
import { CategorisationRulesService } from "../apps/api/dist/modules/categories/rules.service.js";
import { EntitlementService } from "../apps/api/dist/modules/entitlements/entitlement.service.js";

describe("categorisation rules integration and authority", () => {
  const ownerUrl = process.env.MIGRATION_DATABASE_URL;
  const runtimeUrl = process.env.DATABASE_URL;
  if (!ownerUrl || !runtimeUrl) {
    throw new Error("Database URLs required for integration test");
  }

  const owner = createOrm(ownerUrl);
  const runtime = createOrm(runtimeUrl);
  const scoped = new ScopedDatabase(runtime);
  const entitlements = new EntitlementService(scoped);
  const rules = new CategorisationRulesService(scoped, entitlements);

  const householdId = randomUUID();
  const otherHouseholdId = randomUUID();

  function makeActor(hh: string): AuthContext {
    return {
      userId: randomUUID(),
      membershipId: randomUUID(),
      householdId: hh,
      sessionId: randomUUID(),
      requestId: randomUUID(),
      grantVersion: 0,
      aal: "aal2",
      mfaAuthenticatedAt: Date.now(),
    };
  }

  const alice = makeActor(householdId);
  const bob = makeActor(householdId);
  const charlie = makeActor(otherHouseholdId);

  beforeAll(async () => {
    await owner.household.createMany({
      data: [{ id: householdId }, { id: otherHouseholdId }],
    });

    const actors = [
      { actor: alice, slot: 1 },
      { actor: bob, slot: 2 },
      { actor: charlie, slot: 1 },
    ];
    for (const { actor, slot } of actors) {
      await owner.user.create({
        data: {
          id: actor.userId,
          memberships: {
            create: {
              id: actor.membershipId,
              householdId: actor.householdId,
              slot,
            },
          },
          sessions: {
            create: {
              id: actor.sessionId,
              householdId: actor.householdId,
              expiresAt: new Date(Date.now() + 3600000),
            },
          },
        },
      });
    }
  });

  afterAll(async () => {
    await owner.household.deleteMany({
      where: { id: { in: [householdId, otherHouseholdId] } },
    });
    await owner.user.deleteMany({
      where: { id: { in: [alice.userId, bob.userId, charlie.userId] } },
    });
    await owner.$disconnect();
    await runtime.$disconnect();
  });

  it("blocks rule creation when categorisation.automation capability is missing", async () => {
    await expect(
      rules.create(alice, {
        merchantPattern: "Tesco",
        category: "Groceries",
        priority: 10,
        enabled: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("permits rule creation and listing once entitlement is granted", async () => {
    // Grant Plus entitlement with categorisation.automation (valid <= 90 days)
    await owner.entitlementGrant.create({
      data: {
        householdId,
        membershipId: alice.membershipId,
        userId: alice.userId,
        issuer: "test",
        reason: "Plus Plan Subscription",
        capabilities: ["categorisation.automation", "projections.basic"],
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });

    const created = await rules.create(alice, {
      merchantPattern: "Tesco",
      category: "Groceries",
      priority: 10,
      enabled: true,
    });

    expect(created).toMatchObject({
      householdId,
      authorMembershipId: alice.membershipId,
      merchantPattern: "Tesco",
      category: "Groceries",
      priority: 10,
      enabled: true,
      version: 1,
    });

    // Create a second rule with lower priority
    await rules.create(alice, {
      merchantPattern: "Netflix",
      category: "Entertainment",
      priority: 50,
      enabled: true,
    });

    // Bob (in same household, even without individual grant) can read rules for free
    const list = await rules.list(bob);
    expect(list.rules).toHaveLength(2);
    expect(list.rules[0]!.merchantPattern).toBe("Tesco");
    expect(list.rules[1]!.merchantPattern).toBe("Netflix");
  });

  it("prevents partner from updating or deleting author's rule", async () => {
    const list = await rules.list(alice);
    const tescoRule = list.rules.find((r) => r.merchantPattern === "Tesco")!;

    // Bob attempts to update Alice's rule -> Forbidden
    await expect(
      rules.update(
        bob,
        tescoRule.id,
        { category: "Supermarket" },
        tescoRule.version,
      ),
    ).rejects.toMatchObject({ status: 403 });

    // Bob attempts to delete Alice's rule -> Forbidden
    await expect(rules.delete(bob, tescoRule.id)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("updates rule with optimistic locking", async () => {
    const list = await rules.list(alice);
    const tescoRule = list.rules.find((r) => r.merchantPattern === "Tesco")!;

    // Stale version -> Conflict
    await expect(
      rules.update(
        alice,
        tescoRule.id,
        { category: "Supermarket" },
        tescoRule.version + 99,
      ),
    ).rejects.toThrow();

    // Valid update
    const updated = await rules.update(
      alice,
      tescoRule.id,
      { category: "Supermarket", priority: 5 },
      tescoRule.version,
    );

    expect(updated.category).toBe("Supermarket");
    expect(updated.priority).toBe(5);
    expect(updated.version).toBe(tescoRule.version + 1);
  });

  it("allows free rule deletion without entitlement after downgrade", async () => {
    // Revoke entitlement grant
    await owner.entitlementGrant.updateMany({
      where: { householdId, membershipId: alice.membershipId },
      data: { revokedAt: new Date() },
    });

    // Verify entitlement is revoked
    await expect(
      rules.create(alice, {
        merchantPattern: "Spotify",
        category: "Music",
      }),
    ).rejects.toMatchObject({ status: 403 });

    // Reading rules is still free!
    const list = await rules.list(alice);
    expect(list.rules.length).toBeGreaterThan(0);
    const ruleToDelete = list.rules[0]!;

    // Deleting existing rule is also free after downgrade!
    await rules.delete(alice, ruleToDelete.id);

    const afterList = await rules.list(alice);
    expect(afterList.rules.some((r) => r.id === ruleToDelete.id)).toBe(false);
  });

  it("prevents cross-household access (isolated tenant)", async () => {
    // Charlie is in a different household
    const charlieList = await rules.list(charlie);
    expect(charlieList.rules).toHaveLength(0);

    const aliceList = await rules.list(alice);
    if (aliceList.rules.length > 0) {
      const rule = aliceList.rules[0]!;
      // Charlie attempting to delete Alice's rule -> NotFound (no leak of existence)
      await expect(rules.delete(charlie, rule.id)).rejects.toMatchObject({
        status: 404,
      });
    }
  });
});
