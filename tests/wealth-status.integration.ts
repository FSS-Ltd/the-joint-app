import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  statusSubscriptionQuery,
  wealthSummaryDtoSchema,
  accountListSchema,
  type StatusSubscription,
} from "../packages/contracts/src/index.js";
import * as repository from "../apps/api/src/modules/wealth/wealth.repository.js";
import { WealthService } from "../apps/api/src/modules/wealth/wealth.service.js";
import { readWealthClock } from "../apps/api/src/modules/wealth/wealth-clock.js";
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
    data: { createdAt: new Date("2026-01-01") },
  });
  await fixture.owner.account.create({
    data: {
      id: laterAccountId,
      householdId: fixture.householdId,
      creatorUserId: fixture.actor.userId,
      creatorMembershipId: fixture.actor.membershipId,
      label: "Synthetic wealth outside account page",
      kind: "SAVINGS",
      createdAt: new Date("2026-01-02"),
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
function selector(accountIds?: string): StatusSubscription {
  return {
    kind: "wealth",
    householdId: fixture.householdId,
    ...(accountIds === undefined ? {} : { accountIds }),
  };
}
async function open(scope = selector(), auth?: string) {
  const abort = new AbortController();
  const response = await fixture.request(
    statusSubscriptionQuery(scope),
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
async function read(accountIds?: string) {
  const query = new URLSearchParams();
  if (accountIds !== undefined) query.set("accountIds", accountIds);
  const response = await fetch(
    `${fixture.base}/v1/households/${fixture.householdId}/wealth${query.size ? `?${query}` : ""}`,
    { headers: { Authorization: `Bearer ${fixture.actor.token}` } },
  );
  expect(response.status).toBe(200);
  return wealthSummaryDtoSchema.parse(await response.json());
}
async function value(accountId: string, amountMinor: bigint) {
  const [clock] = await fixture.owner.$queryRaw<
    { today: string }[]
  >`SELECT (statement_timestamp() AT TIME ZONE 'Europe/London')::date::text AS today`;
  if (!clock) throw new Error("Synthetic database clock unavailable");
  await fixture.owner.balanceSnapshot.create({
    data: {
      householdId: fixture.householdId,
      accountId,
      authorMembershipId: fixture.actor.membershipId,
      amountMinor,
      adultAmountMinor: amountMinor,
      asOfDate: new Date(clock.today),
    },
  });
}
it("denies anonymous, outsider, invisible, duplicate and unknown wealth scopes before SSE headers", async () => {
  const query = statusSubscriptionQuery(selector(fixture.accountId));
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
  const invisible = await fixture.request(
    statusSubscriptionQuery(selector(laterAccountId)),
    `Bearer ${fixture.partner.token}`,
  );
  expect(invisible.status).toBe(404);
  for (const suffix of [
    "&kind=wealth",
    `&householdId=${fixture.householdId}`,
    `&accountIds=${fixture.accountId}`,
    "&token=synthetic-secret",
  ]) {
    const response = await fixture.request(query + suffix);
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).not.toContain(
      "text/event-stream",
    );
    expect(await response.text()).not.toContain("synthetic-secret");
  }
});
it("bounds visible and selected scope at fifty and never silently narrows an oversized household", async () => {
  const made = Array.from({ length: 49 }, () => randomUUID());
  try {
    await fixture.owner.account.createMany({
      data: made.map((id) => ({
        id,
        householdId: fixture.householdId,
        creatorUserId: fixture.actor.userId,
        creatorMembershipId: fixture.actor.membershipId,
        label: "Synthetic scope bound",
        kind: "SAVINGS",
      })),
    });
    await fixture.owner.accountOwner.createMany({
      data: made.map((accountId) => ({
        householdId: fixture.householdId,
        accountId,
        userId: fixture.actor.userId,
        membershipId: fixture.actor.membershipId,
      })),
    });
    for (const query of [
      statusSubscriptionQuery(selector()),
      `kind=wealth&householdId=${fixture.householdId}&accountIds=${[fixture.accountId, laterAccountId, ...made].join(",")}`,
    ]) {
      const response = await fixture.request(query);
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).not.toContain(
        "text/event-stream",
      );
    }
    expect(
      (await read([fixture.accountId, ...made].join(","))).scope.accountIds,
    ).toHaveLength(50);
    const stream = await open(selector(fixture.accountId));
    await stream.close();
  } finally {
    await fixture.owner.account.deleteMany({ where: { id: { in: made } } });
  }
});
it("includes committed valuations outside an accounts page and preserves selected summary scope", async () => {
  const pageResponse = await fetch(
    `${fixture.base}/v1/households/${fixture.householdId}/accounts?limit=1`,
    { headers: { Authorization: `Bearer ${fixture.actor.token}` } },
  );
  expect(pageResponse.status).toBe(200);
  const page = accountListSchema.parse(await pageResponse.json());
  expect(page.items.map((account) => account.id)).toEqual([fixture.accountId]);
  expect(page.nextCursor).not.toBeNull();
  const all = await open(),
    selected = await open(selector(fixture.accountId));
  let selectedChanged = false;
  const selectedNext = selected.frames.next().then((frame) => {
    selectedChanged = true;
    return frame;
  });
  try {
    await value(laterAccountId, 2300n);
    expect(await all.frames.next()).toBe("event: change\ndata: {}");
    await delay(100);
    expect(selectedChanged).toBe(false);
    expect((await read()).adultNetWorth?.amountMinor).toBe("2300");
    expect((await read(fixture.accountId)).scope.accountIds).toEqual([
      fixture.accountId,
    ]);
    await value(fixture.accountId, 7000n);
    expect(await all.frames.next()).toBe("event: change\ndata: {}");
    expect(await selectedNext).toBe("event: change\ndata: {}");
    expect((await read(fixture.accountId)).adultNetWorth?.amountMinor).toBe(
      "7000",
    );
  } finally {
    await all.close();
    await selected.close();
    await selectedNext.catch(() => {});
  }
});
it("makes no discovery reads during keepalives or unchanged intervals", async () => {
  const observed = vi.spyOn(WealthService.prototype, "observe"),
    stream = await open();
  let received = false;
  const pending = stream.frames.next().then((value) => {
    received = true;
    return value;
  });
  try {
    observed.mockClear();
    await delay(15100);
    expect(observed).not.toHaveBeenCalled();
    expect(received).toBe(false);
  } finally {
    await stream.close();
    await pending.catch(() => {});
    observed.mockRestore();
  }
}, 20000);
it("keeps volatile clocks, cross-tenant commits and rollbacks silent while rechecking committed hints", async () => {
  const observed = vi.spyOn(StatusResources.prototype, "read"),
    stream = await open();
  let received = false;
  const pending = stream.frames.next().then((frame) => {
    received = true;
    return frame;
  });
  try {
    const first = await observed.mock.results[0]?.value;
    observed.mockClear();
    await fixture.owner.account.update({
      where: { id: laterAccountId },
      data: { version: { increment: 1 } },
    });
    await vi.waitFor(() => expect(observed).toHaveBeenCalled());
    for (const result of observed.mock.results)
      expect((await result.value).fingerprint).toBe(first.fingerprint);
    observed.mockClear();
    await fixture.owner.membership.update({
      where: { id: fixture.outsider.membershipId },
      data: { grantVersion: { increment: 1 } },
    });
    await vi.waitFor(() => expect(observed).toHaveBeenCalled());
    for (const result of observed.mock.results)
      expect((await result.value).fingerprint).toBe(first.fingerprint);
    observed.mockClear();
    await expect(
      fixture.owner.$transaction(async (tx) => {
        await tx.account.update({
          where: { id: fixture.accountId },
          data: { totalsVersion: { increment: 1 } },
        });
        throw new Error("Synthetic rollback");
      }),
    ).rejects.toThrow("Synthetic rollback");
    await delay(150);
    expect(observed).not.toHaveBeenCalled();
    expect(received).toBe(false);
    await value(fixture.accountId, 8000n);
    expect(await pending).toBe("event: change\ndata: {}");
  } finally {
    await stream.close();
    await pending.catch(() => {});
    observed.mockRestore();
  }
});
it("invalidates selected scope after grant revocation and shrinks visible scope without retaining revoked evidence", async () => {
  const auth = `Bearer ${fixture.partner.token}`;
  const selected = await open(selector(fixture.accountId), auth),
    visible = await open(selector(), auth);
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
    expect(await selected.frames.next()).toBe("event: invalidate\ndata: {}");
    expect(await selected.frames.next()).toBeNull();
    expect(await visible.frames.next()).toBe("event: change\ndata: {}");
    const response = await fetch(
      `${fixture.base}/v1/households/${fixture.householdId}/wealth`,
      { headers: { Authorization: auth } },
    );
    expect(response.status).toBe(200);
    expect(wealthSummaryDtoSchema.parse(await response.json())).toMatchObject({
      scope: { accountIds: [], sources: [] },
      adultNetWorth: null,
    });
  } finally {
    await selected.close();
    await visible.close();
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
it("rechecks wealth source revisions before authorizing an observation", async () => {
  const original = repository.readWealthScope;
  const changing = vi
    .spyOn(repository, "readWealthScope")
    .mockImplementationOnce(async (...args) => {
      const rows = await original(...args);
      await value(fixture.accountId, 9000n);
      return rows;
    });
  try {
    const response = await fixture.request(
      statusSubscriptionQuery(selector(fixture.accountId)),
    );
    expect(response.status).toBe(409);
    expect(response.headers.get("content-type")).not.toContain(
      "text/event-stream",
    );
    expect(await response.json()).toMatchObject({
      error: { code: "SCOPE_CHANGED" },
    });
  } finally {
    changing.mockRestore();
  }
});
it("returns the database London date and next midnight from the same evaluation clock", async () => {
  const observed = vi.spyOn(WealthService.prototype, "observe"),
    stream = await open();
  try {
    const observation = await observed.mock.results[0]?.value;
    const clock = await readWealthClock(fixture.owner);
    expect(observation.summary.asOfDate).toBe(clock.today);
    expect(observation.nextChangeAt).toBe(clock.nextChangeAt.getTime());
  } finally {
    await stream.close();
    observed.mockRestore();
  }
});
it.each([
  ["2026-03-29T00:30:00.000Z", "2026-03-29", "2026-03-29T23:00:00.000Z", 22.5],
  ["2026-10-25T00:30:00.000Z", "2026-10-25", "2026-10-26T00:00:00.000Z", 23.5],
] as const)(
  "pins independent London DST answers at %s",
  async (instant, today, deadline, remainingHours) => {
    // Execute production SQL, binding only its database clock calls to a fixed instant.
    // No date/deadline expression or expected answer comes from a test SQL copy.
    const clock = await readWealthClock({
      $queryRaw<T>(query: TemplateStringsArray): Promise<T> {
        expect(query).toHaveLength(1);
        const fragments = query
          .join("")
          .split("statement_timestamp()")
          .map((fragment, index) =>
            index === 0 ? fragment : `::timestamptz${fragment}`,
          );
        expect(fragments.length).toBeGreaterThan(1);
        const bound = Object.assign(fragments, { raw: [...fragments] });
        return fixture.owner.$queryRaw<T>(
          bound,
          ...fragments.slice(1).map(() => new Date(instant)),
        );
      },
    });
    expect(clock.today).toBe(today);
    expect(clock.now.toISOString()).toBe(instant);
    expect(clock.nextChangeAt.toISOString()).toBe(deadline);
    expect((Date.parse(deadline) - Date.parse(instant)) / 3600000).toBe(
      remainingHours,
    );
  },
);
it("removes wealth subscriptions and deadline timers at API shutdown", async () => {
  const stream = await open();
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
