import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  sessionStatusStream,
  deletionStatusStream,
} from "../apps/web/lib/server/status-routes.js";

const fixture = vi.hoisted(() => ({ jwt: "synthetic.payload.signature" }));
vi.mock("../apps/web/lib/server/clerk-session.js", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../apps/web/lib/server/clerk-session.js")
    >();
  return { ...original, resolveClerkSessionToken: async () => fixture.jwt };
});
const id = "22222222-2222-4222-8222-222222222222",
  household = "11111111-1111-4111-8111-111111111111",
  token = "s".repeat(43),
  receipt = "r".repeat(43);
const origin = "http://127.0.0.1:3000";
const bytes = (value: string) => new TextEncoder().encode(value);
const query = `kind=import&id=${id}&householdId=${household}`;
let forwarded: { url: string; init: RequestInit }[];
let upstream: () => Response;
function request(
  search = query,
  cookie = `joint-session=${token}`,
  headers: Record<string, string> = {},
  signal?: AbortSignal,
) {
  return new Request(`${origin}/api/events?${search}`, {
    headers: { Cookie: cookie, ...headers },
    signal,
  });
}
beforeEach(() => {
  vi.stubEnv("AUTH_PROVIDER", "local");
  vi.stubEnv("WEB_ORIGIN", origin);
  vi.stubEnv("API_BASE_URL", "http://127.0.0.1:3001");
  forwarded = [];
  upstream = () =>
    new Response("event: change\ndata: {}\n\n", {
      headers: {
        "Content-Type": "text/event-stream",
        "Set-Cookie": "private-upstream-cookie",
        "X-Private": "do-not-forward",
      },
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      forwarded.push({ url: String(url), init: init ?? {} });
      return upstream();
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("forwards session authority only upstream and streams a sanitized no-store protocol", async () => {
  const response = await sessionStatusStream(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Set-Cookie")).toBeNull();
  expect(response.headers.get("X-Private")).toBeNull();
  expect(await response.text()).toBe("event: change\ndata: {}\n\n");
  expect(forwarded[0]?.url).toContain("/v1/events?");
  expect(forwarded[0]?.url).not.toContain(token);
  expect(forwarded[0]?.init).toMatchObject({
    cache: "no-store",
    redirect: "error",
    headers: { Authorization: `Session ${token}`, Accept: "text/event-stream" },
  });
});

it("rejects malformed/duplicate selectors, missing authority and cross-site requests before forwarding", async () => {
  for (const search of [
    query + "&token=private",
    query + "&kind=export",
    "kind=other",
    `kind=deletion&id=${id}`,
  ])
    expect((await sessionStatusStream(request(search))).status).toBe(400);
  for (const cookie of ["", `joint-session=${token}; joint-session=${token}`])
    expect((await sessionStatusStream(request(query, cookie))).status).toBe(
      401,
    );
  const hostileHeaders: Record<string, string>[] = [
    { Origin: "https://foreign.invalid" },
    { "Sec-Fetch-Site": "cross-site" },
    { "Sec-Fetch-Site": "same-site" },
  ];
  for (const headers of hostileHeaders)
    expect(
      (await sessionStatusStream(request(query, undefined, headers))).status,
    ).toBe(403);
  expect(forwarded).toHaveLength(0);
});

it("uses the Clerk session rather than legacy cookies and never exposes its bearer token", async () => {
  vi.stubEnv("AUTH_PROVIDER", "clerk");
  const response = await sessionStatusStream(request());
  expect(forwarded[0]?.init).toMatchObject({
    headers: { Authorization: `Bearer ${fixture.jwt}` },
  });
  expect(await response.text()).not.toContain(fixture.jwt);
});

it("binds deletion streams to their purpose-bound receipt cookie independently of sign-in", async () => {
  const receiptRequest = (cookie: string, search = "") =>
    new Request(
      `${origin}/api/privacy/deletion-requests/${id}/events${search}`,
      { headers: { Cookie: cookie } },
    );
  for (const cookie of [
    "",
    `joint-deletion-receipt=${household}.${receipt}`,
    `joint-deletion-receipt=${id}.${receipt};joint-deletion-receipt=${id}.${receipt}`,
  ])
    expect(
      (await deletionStatusStream(receiptRequest(cookie), id)).status,
    ).toBe(401);
  expect(
    (
      await deletionStatusStream(
        receiptRequest(
          `joint-deletion-receipt=${id}.${receipt}`,
          "?token=private",
        ),
        id,
      )
    ).status,
  ).toBe(400);
  expect(forwarded).toHaveLength(0);
  const response = await deletionStatusStream(
    receiptRequest(`joint-deletion-receipt=${id}.${receipt}`),
    id,
  );
  expect(response.status).toBe(200);
  await response.text();
  expect(forwarded[0]?.init).toMatchObject({
    headers: { Authorization: `Deletion ${receipt}` },
  });
  expect(forwarded[0]?.url).not.toContain(receipt);
});

it("cancels upstream work when a browser stops reading and clears the handshake timer", async () => {
  vi.useFakeTimers();
  const cancelled = vi.fn();
  upstream = () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes("event: change\ndata: {}\n\n"));
        },
        cancel: cancelled,
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  const response = await sessionStatusStream(request());
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Fixture stream missing");
  await reader.read();
  await reader.cancel();
  expect(cancelled).toHaveBeenCalledTimes(1);
  expect(forwarded[0]?.init.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("finishes a pending downstream read when the incoming request is aborted", async () => {
  const abort = new AbortController(),
    cancelled = vi.fn();
  upstream = () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes("event: change\ndata: {}\n\n"));
        },
        cancel: cancelled,
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  const response = await sessionStatusStream(
    request(query, undefined, {}, abort.signal),
  );
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Fixture stream missing");
  await reader.read();
  let ended = false;
  const reading = reader.read().then((value) => {
    ended = value.done;
  });
  try {
    abort.abort();
    await vi.waitFor(() => expect(ended).toBe(true), { timeout: 100 });
    expect(cancelled).toHaveBeenCalledTimes(1);
  } finally {
    await reader.cancel();
    await reading;
  }
});

it("bounds the initial handshake and hides upstream errors and nonempty event data", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("private upstream detail")),
            { once: true },
          );
        }),
    ),
  );
  const pending = sessionStatusStream(request());
  await vi.advanceTimersByTimeAsync(10000);
  const response = await pending;
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private upstream detail");
  expect(vi.getTimerCount()).toBe(0);
});

it("never forwards unexpected upstream event payloads or exception responses", async () => {
  upstream = () =>
    new Response('event: change\ndata: {"private":123}\n\n', {
      headers: { "Content-Type": "text/event-stream" },
    });
  const response = await sessionStatusStream(request());
  await expect(response.text()).rejects.toThrow("Status stream unavailable");
  upstream = () => Response.json({ private: "sentinel" }, { status: 500 });
  const failed = await sessionStatusStream(request());
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("sentinel");
});
