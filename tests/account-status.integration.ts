import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  accountListSchema,
  statusSubscriptionQuery,
  type StatusSubscription,
} from "../packages/contracts/src/index.js";
import { StatusResources } from "../apps/api/src/modules/events/status-resources.js";
import {
  createStatusFixture,
  statusSignals,
} from "./fixtures/status-streams.js";

let fixture: Awaited<ReturnType<typeof createStatusFixture>>;
const laterAccountId = randomUUID();
beforeAll(async () => {
  fixture = await createStatusFixture();
  await vi.waitFor(() => {
    const stop = fixture.hub.subscribe(
      () => {},
      () => {},
    );
    stop();
  });
  await fixture.owner.account.update({
    where: { id: fixture.accountId },
    data: { createdAt: new Date("2026-01-01T00:00:00.000Z") },
  });
  await fixture.owner.account.create({
    data: {
      id: laterAccountId,
      householdId: fixture.householdId,
      creatorUserId: fixture.actor.userId,
      creatorMembershipId: fixture.actor.membershipId,
      label: "Synthetic account outside page",
      kind: "SAVINGS",
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      owners: {
        create: {
          userId: fixture.actor.userId,
          membershipId: fixture.actor.membershipId,
        },
      },
    },
  });
});
afterAll(async () => {
  await fixture?.close();
});

function detail(): StatusSubscription {
  return {
    kind: "account",
    householdId: fixture.householdId,
    id: fixture.accountId,
  };
}
function page(cursor?: string): StatusSubscription {
  return {
    kind: "accounts",
    householdId: fixture.householdId,
    limit: 1,
    ...(cursor ? { cursor } : {}),
  };
}
async function open(selector: StatusSubscription, auth?: string) {
  const abort = new AbortController();
  const response = await fixture.request(
    statusSubscriptionQuery(selector),
    auth,
    abort.signal,
  );
  expect(response.status).toBe(200);
  const frames = statusSignals(response);
  expect(await frames.next()).toBe("event: change\ndata: {}");
  return {
    frames,
    async close() {
      abort.abort();
      await frames.close();
    },
  };
}
async function list(auth = `Bearer ${fixture.actor.token}`) {
  const response = await fetch(
    `${fixture.base}/v1/households/${fixture.householdId}/accounts?limit=1`,
    { headers: { Authorization: auth } },
  );
  expect(response.status).toBe(200);
  return accountListSchema.parse(await response.json());
}

it("denies anonymous and outsider account subscriptions before SSE headers and rejects duplicate or credential fields", async () => {
  for (const selector of [detail(), page()]) {
    const query = statusSubscriptionQuery(selector);
    for (const [auth, status] of [
      ["", 401],
      [`Bearer ${fixture.outsider.token}`, 404],
    ] as const) {
      const response = await fixture.request(query, auth);
      expect(response.status).toBe(status);
      expect(response.headers.get("content-type")).not.toContain(
        "text/event-stream",
      );
    }
    for (const suffix of [
      "&kind=accounts",
      "&householdId=" + fixture.householdId,
      "&token=synthetic-secret",
    ]) {
      const response = await fixture.request(query + suffix);
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).not.toContain(
        "text/event-stream",
      );
      expect(await response.text()).not.toContain("synthetic-secret");
    }
  }
  const response = await fixture.request(
    statusSubscriptionQuery(page()) + "&limit=2",
  );
  expect(response.status).toBe(400);
});

it("observes account and bounded page projections after commit with stable randomized-cursor fingerprints", async () => {
  const first = await list(),
    second = await list();
  expect(first.items.map((item) => item.id)).toEqual([fixture.accountId]);
  expect(first.nextCursor).toEqual(expect.any(String));
  expect(second.nextCursor).not.toBe(first.nextCursor);
  const observed = vi.spyOn(StatusResources.prototype, "read");
  const streams = [];
  try {
    for (const selector of [detail(), page()])
      streams.push(await open(selector));
    const initial = await Promise.all(
      observed.mock.results.map((result) => result.value),
    );
    observed.mockClear();
    await fixture.owner.account.update({
      where: { id: fixture.accountId },
      data: { label: "Committed visible account", version: { increment: 1 } },
    });
    for (const stream of streams)
      expect(await stream.frames.next()).toBe("event: change\ndata: {}");
    const changed = await Promise.all(
      observed.mock.results.map((result) => result.value),
    );
    expect(
      changed.every((snapshot) =>
        initial.every(
          (previous) => previous.fingerprint !== snapshot.fingerprint,
        ),
      ),
    ).toBe(true);
    expect((await list()).items[0]?.label).toBe("Committed visible account");
  } finally {
    for (const stream of streams) await stream.close();
    observed.mockRestore();
  }
});

it("keeps a bounded page unchanged after out-of-window and cross-tenant commits or a rolled-back visible mutation", async () => {
  const observed = vi.spyOn(StatusResources.prototype, "read");
  const stream = await open(page());
  let received = false;
  const next = stream.frames.next().then((value) => {
    received = true;
    return value;
  });
  try {
    const initial = await observed.mock.results[0]?.value;
    observed.mockClear();
    await fixture.owner.account.update({
      where: { id: laterAccountId },
      data: {
        label: "Changed outside requested window",
        version: { increment: 1 },
      },
    });
    await vi.waitFor(() => expect(observed).toHaveBeenCalled());
    for (const result of observed.mock.results)
      expect((await result.value).fingerprint).toBe(initial.fingerprint);
    observed.mockClear();
    await fixture.owner.membership.update({
      where: { id: fixture.outsider.membershipId },
      data: { grantVersion: { increment: 1 } },
    });
    await vi.waitFor(() => expect(observed).toHaveBeenCalled());
    for (const result of observed.mock.results)
      expect((await result.value).fingerprint).toBe(initial.fingerprint);
    await expect(
      fixture.owner.$transaction(async (tx) => {
        await tx.account.update({
          where: { id: fixture.accountId },
          data: { label: "Rolled back label", version: { increment: 1 } },
        });
        throw new Error("Synthetic rollback");
      }),
    ).rejects.toThrow("Synthetic rollback");
    await delay(150);
    expect(received).toBe(false);
    await fixture.owner.account.update({
      where: { id: fixture.accountId },
      data: { version: { increment: 1 } },
    });
    expect(await next).toBe("event: change\ndata: {}");
  } finally {
    await stream.close();
    observed.mockRestore();
  }
});

it("invalidates shared account detail after a grant is revoked and rejects old actor-bound cursors", async () => {
  const auth = `Bearer ${fixture.partner.token}`;
  const cursor = (await list()).nextCursor;
  if (!cursor) throw new Error("Synthetic cursor unavailable");
  const denied = await fixture.request(
    statusSubscriptionQuery(page(cursor)),
    auth,
  );
  expect(denied.status).toBe(400);
  expect(denied.headers.get("content-type")).not.toContain("text/event-stream");
  const stream = await open(detail(), auth);
  try {
    await fixture.owner.accountGrant.update({
      where: {
        accountId_membershipId: {
          accountId: fixture.accountId,
          membershipId: fixture.partner.membershipId,
        },
      },
      data: { level: "NONE", version: { increment: 1 } },
    });
    expect(await stream.frames.next()).toBe("event: invalidate\ndata: {}");
    expect(await stream.frames.next()).toBeNull();
  } finally {
    await stream.close();
    await fixture.owner.accountGrant.update({
      where: {
        accountId_membershipId: {
          accountId: fixture.accountId,
          membershipId: fixture.partner.membershipId,
        },
      },
      data: { level: "TOTALS", version: { increment: 1 } },
    });
  }
});

it("rejects a stale grant-bound page cursor before SSE headers", async () => {
  const cursor = (await list()).nextCursor;
  if (!cursor) throw new Error("Synthetic cursor unavailable");
  await fixture.owner.membership.update({
    where: { id: fixture.actor.membershipId },
    data: { grantVersion: { increment: 1 } },
  });
  const response = await fixture.request(statusSubscriptionQuery(page(cursor)));
  expect(response.status).toBe(400);
  expect(response.headers.get("content-type")).not.toContain(
    "text/event-stream",
  );
  expect(await response.json()).toMatchObject({
    error: { code: "INVALID_CURSOR" },
  });
});

it("invalidates active account streams when the internal session is revoked", async () => {
  const mapping = await fixture.owner.clerkSession.findUniqueOrThrow({
    where: {
      issuer_externalSessionId: {
        issuer: fixture.provider.environment.CLERK_ISSUER,
        externalSessionId: fixture.actor.external.sessionId,
      },
    },
  });
  const stream = await open(detail());
  try {
    await fixture.owner.sessionRegistry.update({
      where: { id: mapping.internalSessionId },
      data: { revokedAt: new Date() },
    });
    expect(await stream.frames.next()).toBe("event: invalidate\ndata: {}");
    expect(await stream.frames.next()).toBeNull();
  } finally {
    await stream.close();
    await fixture.owner.sessionRegistry.update({
      where: { id: mapping.internalSessionId },
      data: { revokedAt: null },
    });
  }
});

it("schedules account and page status at a future London valuation date", async () => {
  await fixture.owner.balanceSnapshot.create({
    data: {
      householdId: fixture.householdId,
      accountId: fixture.accountId,
      authorMembershipId: fixture.actor.membershipId,
      amountMinor: 100n,
      asOfDate: new Date("2099-01-01T00:00:00.000Z"),
    },
  });
  const observed = vi.spyOn(StatusResources.prototype, "read");
  const streams = [];
  try {
    for (const selector of [detail(), page()])
      streams.push(await open(selector));
    const snapshotsFor = async (kind: "account" | "accounts") =>
      Promise.all(
        observed.mock.calls.flatMap(([selector], index) =>
          selector.kind === kind ? [observed.mock.results[index]!.value] : [],
        ),
      );
    const expectedDeadline = Date.parse("2099-01-01T00:00:00.000Z");
    const initial = await Promise.all([
      snapshotsFor("account"),
      snapshotsFor("accounts"),
    ]);
    for (const snapshots of initial) {
      expect(snapshots.length).toBeGreaterThan(0);
      expect(
        snapshots.every(
          (snapshot) => snapshot.resourceExpiresAt === expectedDeadline,
        ),
      ).toBe(true);
    }
    observed.mockClear();
    await fixture.owner
      .$executeRaw`SELECT pg_notify('joint_status_wakeup', '')`;
    await vi.waitFor(() => {
      for (const kind of ["account", "accounts"])
        expect(
          observed.mock.calls.some(([selector]) => selector.kind === kind),
        ).toBe(true);
    });
    const rereads = await Promise.all([
      snapshotsFor("account"),
      snapshotsFor("accounts"),
    ]);
    for (const [index, snapshots] of rereads.entries()) {
      expect(
        snapshots.every(
          (snapshot) =>
            snapshot.resourceExpiresAt === expectedDeadline &&
            snapshot.fingerprint === initial[index]?.[0]?.fingerprint,
        ),
      ).toBe(true);
    }
  } finally {
    for (const stream of streams) await stream.close();
    observed.mockRestore();
  }
});

it("disconnects account page streams and removes the event subscription at API shutdown", async () => {
  const stream = await open(page());
  try {
    const closing = fixture.app.close();
    expect(await stream.frames.next()).toBe("event: reconnect\ndata: {}");
    expect(await stream.frames.next()).toBeNull();
    await closing;
    expect(() =>
      fixture.hub.subscribe(
        () => {},
        () => {},
      ),
    ).toThrow();
  } finally {
    await stream.close();
  }
});
