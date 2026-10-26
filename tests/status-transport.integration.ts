import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  createStatusFixture,
  statusSignals,
} from "./fixtures/status-streams.js";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { JobsRepository } from "../packages/database/dist/jobs.repository.js";
import { StatusResources } from "../apps/api/src/modules/events/status-resources.js";

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

it("authorizes an import stream and emits an empty change only after committed status changes", async () => {
  const abort = new AbortController();
  const observed = vi.spyOn(StatusResources.prototype, "read");
  try {
    const response = await fixture.request(
      fixture.url("import", fixture.batchId, fixture.householdId),
      undefined,
      abort.signal,
    );
    expect(observed).toHaveBeenCalled();
    await expect(observed.mock.results[0]?.value).resolves.toMatchObject({
      fingerprint: expect.any(String),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Stream unavailable");
    const text = (value: Uint8Array | undefined) =>
      new TextDecoder().decode(value);
    expect(text((await reader.read()).value)).toBe(
      "event: change\ndata: {}\n\n",
    );
    await fixture.owner.importBatch.update({
      where: { id: fixture.batchId },
      data: { state: "READY", version: { increment: 1 } },
    });
    expect(text((await reader.read()).value)).toBe(
      "event: change\ndata: {}\n\n",
    );
  } finally {
    abort.abort();
    observed.mockRestore();
  }
});

it("denies other households, non-owner imports and ambiguous selectors before streaming", async () => {
  const query = fixture.url("import", fixture.batchId, fixture.householdId);
  for (const token of [fixture.partner.token, fixture.outsider.token]) {
    const response = await fixture.request(query, `Bearer ${token}`);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).not.toContain(
      "text/event-stream",
    );
  }
  for (const suffix of ["&kind=export", "&token=synthetic-secret"]) {
    const response = await fixture.request(query + suffix);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("synthetic-secret");
  }
});

it("suppresses unrelated household changes and closes on live ownership revocation", async () => {
  const abort = new AbortController();
  const response = await fixture.request(
    fixture.url("import", fixture.batchId, fixture.householdId),
    undefined,
    abort.signal,
  );
  expect(response.status).toBe(200);
  const frames = statusSignals(response);
  try {
    expect(await frames.next()).toBe("event: change\ndata: {}");
    let received = false;
    const next = frames.next().then((frame) => {
      received = true;
      return frame;
    });
    await fixture.owner.membership.update({
      where: { id: fixture.outsider.membershipId },
      data: { grantVersion: { increment: 1 } },
    });
    await delay(100);
    expect(received).toBe(false);
    await fixture.owner.accountOwner.update({
      where: {
        accountId_userId: {
          accountId: fixture.accountId,
          userId: fixture.actor.userId,
        },
      },
      data: { status: "ARCHIVED" },
    });
    expect(await next).toBe("event: invalidate\ndata: {}");
    expect(await frames.next()).toBeNull();
  } finally {
    abort.abort();
    await frames.close();
    await fixture.owner.accountOwner.update({
      where: {
        accountId_userId: {
          accountId: fixture.accountId,
          userId: fixture.actor.userId,
        },
      },
      data: { status: "ACTIVE" },
    });
  }
});

it("renews at verified bearer expiry even while the provider session remains valid", async () => {
  const abort = new AbortController();
  const token = await fixture.provider.token(
    fixture.actor.external.userId,
    fixture.actor.external.sessionId,
    { exp: Math.floor(Date.now() / 1000) + 2 },
  );
  try {
    const response = await fixture.request(
      fixture.url("import", fixture.batchId, fixture.householdId),
      `Bearer ${token}`,
      abort.signal,
    );
    expect(response.status).toBe(200);
    const frames = statusSignals(response);
    expect(await frames.next()).toBe("event: change\ndata: {}");
    expect(await frames.next()).toBe("event: renew\ndata: {}");
    expect(await frames.next()).toBeNull();
  } finally {
    abort.abort();
  }
});

it("closes an open subscription at the inactivity deadline without waiting for another notification", async () => {
  const mapping = await fixture.owner.clerkSession.findUniqueOrThrow({
    where: {
      issuer_externalSessionId: {
        issuer: fixture.provider.environment.CLERK_ISSUER,
        externalSessionId: fixture.actor.external.sessionId,
      },
    },
  });
  const previous = await fixture.owner.sessionRegistry.findUniqueOrThrow({
    where: { id: mapping.internalSessionId },
  });
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 5000);
  try {
    await fixture.owner
      .$executeRaw`UPDATE app."SessionRegistry" SET "lastSeenAt"=clock_timestamp()-interval '598 seconds' WHERE id=${mapping.internalSessionId}::uuid`;
    const response = await fixture.request(
      fixture.url("import", fixture.batchId, fixture.householdId),
      undefined,
      abort.signal,
    );
    expect(response.status).toBe(200);
    const frames = statusSignals(response);
    expect(await frames.next()).toBe("event: change\ndata: {}");
    expect(await frames.next()).toBe("event: renew\ndata: {}");
    expect(await frames.next()).toBeNull();
  } finally {
    clearTimeout(timeout);
    abort.abort();
    await fixture.owner.sessionRegistry.update({
      where: { id: mapping.internalSessionId },
      data: { lastSeenAt: previous.lastSeenAt },
    });
  }
});

it("keeps deletion receipts independent of sign-in, isolated by hash and bounded by receipt expiry", async () => {
  const query = fixture.url("deletion", fixture.receiptId);
  expect((await fixture.request(query)).status).toBe(401);
  expect(
    (await fixture.request(query, `Deletion ${"x".repeat(43)}`)).status,
  ).toBe(404);
  await fixture.owner.deletionRequest.update({
    where: { id: fixture.receiptId },
    data: { statusExpiresAt: new Date(Date.now() + 1500) },
  });
  const abort = new AbortController();
  try {
    const response = await fixture.request(
      query,
      `Deletion ${fixture.receiptToken}`,
      abort.signal,
    );
    expect(response.status).toBe(200);
    const frames = statusSignals(response);
    expect(await frames.next()).toBe("event: change\ndata: {}");
    expect(await frames.next()).toBe("event: invalidate\ndata: {}");
    expect(await frames.next()).toBeNull();
  } finally {
    abort.abort();
  }
});

it("disconnects revoked sessions and reconciles a missed committed change after listener reconnect", async () => {
  const query = fixture.url("import", fixture.batchId, fixture.householdId);
  const abort = new AbortController();
  try {
    const response = await fixture.request(query, undefined, abort.signal),
      frames = statusSignals(response);
    expect(await frames.next()).toBe("event: change\ndata: {}");
    await fixture.owner
      .$queryRaw`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='joint-status-events' AND datname=current_database()`;
    expect(await frames.next()).toBe("event: reconnect\ndata: {}");
    expect(await frames.next()).toBeNull();
    await fixture.owner.importBatch.update({
      where: { id: fixture.batchId },
      data: { version: { increment: 1 }, processedRows: 4 },
    });
    await vi.waitFor(
      () => {
        const stop = fixture.hub.subscribe(
          () => {},
          () => {},
        );
        stop();
      },
      { timeout: 3000 },
    );
    const fresh = await fixture.request(query, undefined, abort.signal),
      next = statusSignals(fresh);
    expect(await next.next()).toBe("event: change\ndata: {}");
    const mapping = await fixture.owner.clerkSession.findUniqueOrThrow({
      where: {
        issuer_externalSessionId: {
          issuer: fixture.provider.environment.CLERK_ISSUER,
          externalSessionId: fixture.actor.external.sessionId,
        },
      },
    });
    try {
      await fixture.owner.sessionRegistry.update({
        where: { id: mapping.internalSessionId },
        data: { revokedAt: new Date() },
      });
      expect(await next.next()).toBe("event: invalidate\ndata: {}");
      expect(await next.next()).toBeNull();
    } finally {
      await fixture.owner.sessionRegistry.update({
        where: { id: mapping.internalSessionId },
        data: { revokedAt: null },
      });
      await next.close();
    }
  } finally {
    abort.abort();
  }
});

it("preserves requester and owner-archive boundaries for export streams", async () => {
  const create = async (
    active: typeof fixture,
    archive: boolean,
  ): Promise<string> => {
    const path = archive
      ? "/v1/me/archive/exports"
      : `/v1/households/${active.householdId}/exports`;
    const response = await fetch(active.base + path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${active.actor.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accountIds: [active.accountId] }),
    });
    expect(response.status).toBe(202);
    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("id" in body) ||
      typeof body.id !== "string"
    )
      throw new Error("Fixture export unavailable");
    return body.id;
  };
  async function observe(
    active: typeof fixture,
    archive: boolean,
  ): Promise<void> {
    const id = await create(active, archive);
    const query = active.url(
      archive ? "archive-export" : "export",
      id,
      archive ? undefined : active.householdId,
    );
    expect(
      (await active.request(query, `Bearer ${active.partner.token}`)).status,
    ).toBe(404);
    const abort = new AbortController();
    try {
      const response = await active.request(
          query,
          `Bearer ${active.actor.token}`,
          abort.signal,
        ),
        frames = statusSignals(response);
      expect(response.status).toBe(200);
      expect(await frames.next()).toBe("event: change\ndata: {}");
      const job = await active.owner.job.findFirstOrThrow({
        where: { resourceId: id, type: "csv.export" },
      });
      const jobs = new JobsRepository(active.owner);
      expect(await jobs.cancel(active.householdId, job.id)).toBe(true);
      expect(await frames.next()).toBe("event: change\ndata: {}");
    } finally {
      abort.abort();
    }
  }
  await observe(fixture, false);
  const archived = await createStatusFixture();
  try {
    await vi.waitFor(() => {
      const stop = archived.hub.subscribe(
        () => {},
        () => {},
      );
      stop();
    });
    await archived.owner.$transaction(async (tx) => {
      await tx.accountOwner.update({
        where: {
          accountId_userId: {
            accountId: archived.accountId,
            userId: archived.actor.userId,
          },
        },
        data: { status: "ARCHIVED" },
      });
      await tx.membership.update({
        where: { id: archived.actor.membershipId },
        data: { status: "LEFT", slot: null, grantVersion: { increment: 1 } },
      });
    });
    // Leaving makes the old household-bound session unusable; use a new sign-in.
    const previous = archived.provider.sessions.get(
      archived.actor.external.sessionId,
    );
    if (!previous) throw new Error("Fixture session unavailable");
    const sessionId = `sess_${randomUUID().replaceAll("-", "")}`;
    archived.provider.sessions.set(sessionId, {
      ...previous,
      id: sessionId,
      createdAt: Date.now() - 1000,
    });
    archived.actor.token = await archived.provider.token(
      archived.actor.external.userId,
      sessionId,
    );
    await observe(archived, true);
  } finally {
    await archived.close();
  }
});

it("closes active streams and its database listener during API shutdown", async () => {
  const abort = new AbortController();
  try {
    const response = await fixture.request(
        fixture.url("import", fixture.batchId, fixture.householdId),
        undefined,
        abort.signal,
      ),
      frames = statusSignals(response);
    expect(await frames.next()).toBe("event: change\ndata: {}");
    const closing = fixture.app.close();
    expect(await frames.next()).toBe("event: reconnect\ndata: {}");
    expect(await frames.next()).toBeNull();
    await closing;
    const [row] = await fixture.owner.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) FROM pg_stat_activity WHERE application_name='joint-status-events' AND datname=current_database()`;
    expect(row?.count).toBe(0n);
  } finally {
    abort.abort();
  }
});
afterAll(async () => {
  await fixture?.close();
});
