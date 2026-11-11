import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  spendingReportSchema,
  statusSubscriptionQuery,
} from "../packages/contracts/src/index.js";
import { readLondonClock } from "../apps/api/src/london-clock.js";
import * as reportComponents from "../apps/api/src/modules/reports/report-components.js";
import { ReportService } from "../apps/api/src/modules/reports/report.service.js";
import {
  createStatusFixture,
  statusSignals,
} from "./fixtures/status-streams.js";

let fixture: Awaited<ReturnType<typeof createStatusFixture>>;
beforeAll(async () => {
  fixture = await createStatusFixture();
  await vi.waitFor(() => {
    const stop = fixture.hub.subscribe(
      () => {},
      () => {},
    );
    stop();
  });
});
afterAll(async () => {
  if (!fixture) return;
  await fixture.owner.budgetScope.deleteMany({
    where: { householdId: fixture.householdId },
  });
  await fixture.owner.account.deleteMany({
    where: { householdId: fixture.otherHouseholdId },
  });
  await fixture.close();
});

const query = () =>
  statusSubscriptionQuery({
    kind: "spending",
    householdId: fixture.householdId,
  });

async function report(token = fixture.actor.token) {
  const response = await fetch(
    `${fixture.base}/v1/households/${fixture.householdId}/reports/spending?month=current`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(response.status).toBe(200);
  return spendingReportSchema.parse(await response.json());
}

function expense(today: string, amountMinor: bigint) {
  return {
    householdId: fixture.householdId,
    accountId: fixture.accountId,
    sourceNamespace: "MANUAL" as const,
    sourceId: randomUUID(),
    sourceHash: "a".repeat(64),
    fingerprint: "b".repeat(64),
    amountMinor,
    bookedDate: new Date(today),
    description: "Synthetic spending status row",
    override: {
      create: {
        authorMembershipId: fixture.actor.membershipId,
        classificationKind: "EXPENSE" as const,
        category: "Food",
      },
    },
  };
}

it("enforces authorization and strict scope before sending spending status frames", async () => {
  for (const [auth, status, suffix] of [
    ["", 401, ""],
    [`Bearer ${fixture.outsider.token}`, 404, ""],
    [`Bearer ${fixture.actor.token}`, 400, "&month=2026-01"],
  ] as const) {
    const response = await fixture.request(query() + suffix, auth);
    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).not.toContain(
      "text/event-stream",
    );
  }
  expect(
    await fixture.database
      .$queryRaw`SELECT * FROM app.spending_ledger_revisions(ARRAY[${fixture.accountId}::uuid])`,
  ).toEqual([]);
});

it("refreshes after committed spending and cap edits and keeps totals-only views private", async () => {
  const { owner, householdId, accountId, actor, partner } = fixture;
  const { today } = await readLondonClock(owner);
  const month = today.slice(0, 7);
  expect(await report()).toMatchObject({ month, scope: [{ id: accountId }] });
  expect(await report(partner.token)).toMatchObject({
    scope: [],
    budget: null,
    summary: null,
  });

  const signal = AbortSignal.timeout(5000);
  const ownerFrames = statusSignals(
    await fixture.request(query(), undefined, signal),
  );
  const partnerFrames = statusSignals(
    await fixture.request(query(), `Bearer ${partner.token}`, signal),
  );
  const changed = "event: change\ndata: {}";
  let partnerReceived = false;
  try {
    expect(await ownerFrames.next()).toBe(changed);
    expect(await partnerFrames.next()).toBe(changed);
    const pendingPartner = partnerFrames
      .next()
      .then((frame) => {
        partnerReceived = frame !== null;
      })
      .catch(() => {});
    const source = expense(today, -1250n);
    const wake = vi.fn();
    const unsubscribe = fixture.hub
      .forSpending(householdId)
      .subscribe(wake, () => {});
    try {
      await expect(
        owner.$transaction(async (tx) => {
          await tx.transaction.create({ data: source });
          throw new Error("Synthetic rollback");
        }),
      ).rejects.toThrow("Synthetic rollback");
      await delay(150);
      expect(wake).not.toHaveBeenCalled();
      await owner.transaction.create({ data: source });
      expect(await ownerFrames.next()).toBe(changed);
      expect((await report()).summary?.spending.amountMinor).toBe("1250");
    } finally {
      unsubscribe();
    }

    const response = await fetch(
      `${fixture.base}/v1/households/${householdId}/budgets/${month}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${actor.token}`,
          "Content-Type": "application/json",
          "If-Match": '"0"',
        },
        body: JSON.stringify({
          accountIds: [accountId],
          lines: [
            {
              category: "Food",
              limit: { amountMinor: "3000", currency: "GBP" },
            },
          ],
        }),
      },
    );
    expect(response.status).toBe(200);
    expect(await ownerFrames.next()).toBe(changed);
    const { budget } = await report();
    if (!budget) throw new Error("Fixture cap unavailable");
    expect(budget?.lines[0]?.limit.amountMinor).toBe("3000");
    const wakeOnNoop = vi.fn();
    const stop = fixture.hub
      .forSpending(householdId)
      .subscribe(wakeOnNoop, () => {});
    try {
      await owner.$executeRaw`UPDATE app."BudgetLine" SET "amountMinor"="amountMinor" WHERE "budgetId"=${budget.id}::uuid`;
      await delay(150);
      expect(wakeOnNoop).not.toHaveBeenCalled();
    } finally {
      stop();
    }
    expect(await report(partner.token)).toMatchObject({
      scope: [],
      budget: null,
      summary: null,
    });
    await partnerFrames.close();
    await pendingPartner;
    expect(partnerReceived).toBe(false);
  } finally {
    await ownerFrames.close();
    await partnerFrames.close();
  }
});

it("wakes only the matching household without running spending aggregates", async () => {
  const { owner, otherHouseholdId, outsider } = fixture;
  const { today } = await readLondonClock(owner);
  await owner.account.create({
    data: {
      householdId: otherHouseholdId,
      creatorUserId: outsider.userId,
      creatorMembershipId: outsider.membershipId,
      label: "Other synthetic household",
      kind: "CURRENT",
      owners: {
        create: {
          userId: outsider.userId,
          membershipId: outsider.membershipId,
        },
      },
    },
  });
  const observations = vi.spyOn(ReportService.prototype, "observeCurrent");
  const aggregate = vi.spyOn(reportComponents, "reportComponents");
  const provenance = vi.spyOn(reportComponents, "reportProvenance");
  const signal = AbortSignal.timeout(5000);
  const first = statusSignals(
    await fixture.request(query(), undefined, signal),
  );
  const second = statusSignals(
    await fixture.request(
      statusSubscriptionQuery({
        kind: "spending",
        householdId: otherHouseholdId,
      }),
      `Bearer ${outsider.token}`,
      signal,
    ),
  );
  const changed = "event: change\ndata: {}";
  try {
    expect(await first.next()).toBe(changed);
    expect(await second.next()).toBe(changed);
    const previous = (await observations.mock.results[1]?.value)?.status;
    expect(previous?.scope).toHaveLength(1);
    observations.mockClear();
    await owner.transaction.create({ data: expense(today, -1320n) });
    expect(await first.next()).toBe(changed);
    await delay(150);
    expect(observations).toHaveBeenCalledTimes(1);
    expect(observations.mock.calls[0]?.[0].householdId).toBe(
      fixture.householdId,
    );
    expect(aggregate).not.toHaveBeenCalled();
    expect(provenance).not.toHaveBeenCalled();
  } finally {
    await first.close();
    await second.close();
    observations.mockRestore();
    aggregate.mockRestore();
    provenance.mockRestore();
  }
});

it("invalidates a spending stream after its registry session is revoked", async () => {
  const mapping = await fixture.owner.clerkSession.findUniqueOrThrow({
    where: {
      issuer_externalSessionId: {
        issuer: fixture.provider.environment.CLERK_ISSUER,
        externalSessionId: fixture.actor.external.sessionId,
      },
    },
  });
  const frames = statusSignals(
    await fixture.request(query(), undefined, AbortSignal.timeout(5000)),
  );
  try {
    expect(await frames.next()).toBe("event: change\ndata: {}");
    await fixture.owner.sessionRegistry.update({
      where: { id: mapping.internalSessionId },
      data: { revokedAt: new Date() },
    });
    expect(await frames.next()).toBe("event: invalidate\ndata: {}");
    expect(await frames.next()).toBeNull();
  } finally {
    await frames.close();
  }
});
