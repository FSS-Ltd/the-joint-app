import { createServer } from "node:http";
import { once } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { openStatusStream } from "../apps/api/src/modules/events/status-stream.js";
import type { StatusSnapshot } from "../apps/api/src/modules/events/status-observer.js";

afterEach(() => vi.useRealTimers());

it("invalidates an observer whose database authority fence is revoked", async () => {
  let wake: (() => void) | undefined;
  const read = vi
    .fn<() => Promise<StatusSnapshot>>()
    .mockResolvedValueOnce({
      fingerprint: "initial",
      credentialExpiresAt: Date.now() + 60000,
      resourceExpiresAt: null,
      expiryEvent: "renew",
    })
    .mockRejectedValueOnce(new Error("Authorization scope is no longer valid"));
  const server = createServer((_request, response) => {
    void openStatusStream(response, {
      source: {
        subscribe(onWake) {
          wake = onWake;
          return () => {};
        },
      },
      read,
    }).catch(() => {
      response.statusCode = 503;
      response.end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture address unavailable");
  const abort = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}`, {
      signal: abort.signal,
    });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Stream unavailable");
    await reader.read();
    wake?.();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(
      "event: invalidate\ndata: {}\n\n",
    );
    expect((await reader.read()).done).toBe(true);
  } finally {
    abort.abort();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
it("streams only empty hints, emits query-free heartbeats and cleans up after browser cancellation", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  let wake: (() => void) | undefined;
  const stop = vi.fn();
  const source = {
    subscribe(onWake: () => void) {
      wake = onWake;
      return stop;
    },
  };
  let fingerprint = "private-financial-value";
  const read = vi.fn(async (): Promise<StatusSnapshot> => ({
    fingerprint,
    credentialExpiresAt: Date.now() + 60000,
    resourceExpiresAt: null,
    expiryEvent: "renew",
  }));
  const server = createServer((_request, response) => {
    void openStatusStream(response, { source, read }).catch(() => {
      response.statusCode = 503;
      response.end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture address unavailable");
  const abort = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}`, {
      signal: abort.signal,
    });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Fixture stream unavailable");
    const text = (chunk: Uint8Array | undefined) =>
      new TextDecoder().decode(chunk);
    expect(text((await reader.read()).value)).toBe(
      "event: change\ndata: {}\n\n",
    );
    await vi.advanceTimersByTimeAsync(15000);
    expect(text((await reader.read()).value)).toBe(": keepalive\n\n");
    expect(read).toHaveBeenCalledTimes(1);
    fingerprint = "changed-private-value";
    wake?.();
    expect(text((await reader.read()).value)).toBe(
      "event: change\ndata: {}\n\n",
    );
    abort.abort();
    await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    abort.abort();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("does not send streaming headers until initial authorization succeeds", async () => {
  const stop = vi.fn();
  const server = createServer((_request, response) => {
    void openStatusStream(response, {
      source: { subscribe: () => stop },
      read: async () => {
        throw new Error("private details");
      },
    }).catch(() => {
      response.statusCode = 403;
      response.end("denied");
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture address unavailable");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}`);
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type") ?? "").not.toContain(
      "text/event-stream",
    );
    expect(await response.text()).toBe("denied");
    expect(stop).toHaveBeenCalledTimes(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
