import { afterEach, expect, it, vi } from "vitest";
import { authResultSchema } from "../packages/contracts/src/index.js";
import {
  createNativeTransport,
  NativeApiError,
  IdentityApiError,
} from "./fixtures/native-api.js";
import type { NativeSend } from "../apps/mobile/src/api/types.js";
import { providerError } from "./fixtures/clerk-sdk.js";

const base = "https://api.example.test";
const householdId = "00000000-0000-4000-8000-000000000001";
const selector = { kind: "accounts", householdId, limit: 50 } as const;
const signal = () => new AbortController().signal;
const result = () => Response.json({ state: "SIGNED_OUT" });
afterEach(() => vi.useRealTimers());

it("never requests credentials or sends work when already cancelled", async () => {
  const getToken = vi.fn(async () => "token"),
    send = vi.fn<NativeSend>();
  const transport = createNativeTransport(base, getToken, send);
  const abort = new AbortController();
  abort.abort();
  await expect(
    transport.request("me", authResultSchema, {
      method: "GET",
      signal: abort.signal,
    }),
  ).rejects.toMatchObject({ status: 0, outcome: "rejected" });
  await expect(
    transport.openStatus(selector, abort.signal),
  ).rejects.toMatchObject({ status: 0 });
  expect(getToken).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});
it.each([
  null,
  providerError(401),
  providerError(403),
  providerError(404, "session_not_found"),
])("fails closed on absent or terminal credentials", async (credential) => {
  const send = vi.fn<NativeSend>();
  const transport = createNativeTransport(
    base,
    async () => {
      if (credential === null) return null;
      throw credential;
    },
    send,
  );
  await expect(
    transport.request("me", authResultSchema, {
      method: "GET",
      signal: signal(),
    }),
  ).rejects.toMatchObject({ status: 401 });
  await expect(transport.openStatus(selector, signal())).rejects.toMatchObject({
    status: 401,
  });
  expect(send).not.toHaveBeenCalled();
});
it("preserves identity construction and safe messages without exposing upstream text", async () => {
  expect(new NativeApiError(401)).toBeInstanceOf(IdentityApiError);
  const transport = createNativeTransport(
    base,
    async () => "token",
    async () =>
      Response.json(
        { error: { code: "UNKNOWN", message: "private data" } },
        { status: 503 },
      ),
  );
  await expect(
    transport.request("me", authResultSchema, {
      method: "GET",
      signal: signal(),
    }),
  ).rejects.not.toThrow("private data");
});
it("removes caller listeners and timers on successful JSON reads", async () => {
  vi.useFakeTimers();
  const caller = new AbortController();
  const add = vi.spyOn(caller.signal, "addEventListener"),
    remove = vi.spyOn(caller.signal, "removeEventListener");
  const transport = createNativeTransport(
    base,
    async () => "token",
    async () => result(),
  );
  expect(
    await transport.request("me", authResultSchema, {
      method: "GET",
      signal: caller.signal,
    }),
  ).toEqual({ state: "SIGNED_OUT" });
  expect(add).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0]?.[1]);
  expect(vi.getTimerCount()).toBe(0);
});
it("fences late token completion without dispatch or retained timers", async () => {
  vi.useFakeTimers();
  let finish: ((token: string) => void) | undefined;
  const send = vi.fn<NativeSend>();
  const transport = createNativeTransport(
    base,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    send,
  );
  const request = transport.request("me", authResultSchema, {
    method: "GET",
    signal: signal(),
  });
  const rejected = expect(request).rejects.toMatchObject({ status: 0 });
  await vi.advanceTimersByTimeAsync(15000);
  await rejected;
  finish?.("late-private-token");
  await vi.advanceTimersByTimeAsync(0);
  expect(send).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it("bounds the total token, send and body time rather than restarting deadlines", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const transport = createNativeTransport(
    base,
    () => new Promise((resolve) => setTimeout(() => resolve("token"), 10000)),
    async () => new Response(new ReadableStream({ cancel })),
  );
  let done = false;
  const request = transport
    .request("me", authResultSchema, { method: "GET", signal: signal() })
    .catch(() => {
      done = true;
    });
  await vi.advanceTimersByTimeAsync(14999);
  expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await request;
  expect(done).toBe(true);
  expect(cancel).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it("limits JSON bytes using streamed UTF-8 size even when content length lies", async () => {
  const cancel = vi.fn();
  const transport = createNativeTransport(
    base,
    async () => "token",
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('"' + "é".repeat(524288) + '"'),
            );
          },
          cancel,
        }),
        { headers: { "Content-Length": "1" } },
      ),
  );
  await expect(
    transport.request("me", authResultSchema, {
      method: "GET",
      signal: signal(),
    }),
  ).rejects.toMatchObject({ status: 0 });
  expect(cancel).toHaveBeenCalledOnce();
});
it("rejects cleanup capabilities on any path except the exact POST retry endpoint", async () => {
  const send = vi.fn<NativeSend>(),
    getToken = vi.fn(async () => "token");
  const transport = createNativeTransport(base, getToken, send);
  for (const path of ["me", "auth/logout/retry?next=me"])
    await expect(
      transport.request(path, authResultSchema, {
        method: "POST",
        signal: signal(),
        authorization: { kind: "logout-cleanup", ticket: "v1.abc.def.ghi" },
        body: {},
      }),
    ).rejects.toMatchObject({ status: 401 });
  expect(send).not.toHaveBeenCalled();
  expect(getToken).not.toHaveBeenCalled();
});
it("rejects foreign/traversing paths before bearer acquisition", async () => {
  const token = vi.fn(async () => "token"),
    send = vi.fn<NativeSend>();
  const transport = createNativeTransport(base, token, send);
  for (const path of [
    "https://other.test",
    "../me",
    "auth/../../me",
    "/me",
    "%2e%2e/me",
  ])
    await expect(
      transport.request(path, authResultSchema, {
        method: "GET",
        signal: signal(),
      }),
    ).rejects.toThrow();
  expect(token).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});
it("retains the original write options while token acquisition is pending", async () => {
  let finish: ((token: string) => void) | undefined;
  const send = vi.fn<NativeSend>(async () => result());
  const transport = createNativeTransport(
    base,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    send,
  );
  const options = {
    method: "PATCH" as "PATCH" | "GET",
    signal: signal(),
    version: 2,
    body: { label: "Original" },
  };
  const pending = transport.request("accounts", authResultSchema, options);
  options.method = "GET";
  options.version = 3;
  options.body.label = "New";
  finish?.("token");
  await pending;
  expect(send.mock.calls[0]?.[1]).toMatchObject({
    method: "PATCH",
    body: '{"label":"Original"}',
    headers: { "If-Match": '"2"' },
  });
});

it("rejects oversized outbound JSON before credentials or a mutation can leave the device", async () => {
  const token = vi.fn(async () => "token"),
    send = vi.fn<NativeSend>();
  const transport = createNativeTransport(base, token, send);
  await expect(
    transport.request("accounts", authResultSchema, {
      method: "POST",
      signal: signal(),
      body: { label: "é".repeat(524288) },
    }),
  ).rejects.toMatchObject({ status: 0, outcome: "rejected" });
  expect(token).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});
it("accepts a complete JSON response exactly at the byte limit", async () => {
  const transport = createNativeTransport(
    base,
    async () => "token",
    async () => new Response('"' + "a".repeat(1048574) + '"'),
  );
  const value = await transport.request(
    "me",
    {
      parse(value: unknown): string {
        if (typeof value !== "string") throw Error("Invalid string");
        return value;
      },
    },
    { method: "GET", signal: signal() },
  );
  expect(value.length).toBe(1048574);
});
it("fences a body read that completes after caller cancellation", async () => {
  vi.useFakeTimers();
  let finish:
    ((value: { done: boolean; value?: Uint8Array }) => void) | undefined;
  const cancel = vi.fn(async () => {}),
    releaseLock = vi.fn();
  const caller = new AbortController();
  const send: NativeSend = async () => ({
    status: 200,
    headers: new Headers(),
    body: {
      cancel,
      getReader: () => ({
        read: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
        cancel,
        releaseLock,
      }),
    },
  });
  const parse = vi.fn((value: unknown) => value);
  const transport = createNativeTransport(base, async () => "token", send);
  const pending = transport.request(
    "accounts",
    { parse },
    {
      method: "PATCH",
      signal: caller.signal,
      body: { label: "Pending" },
      version: 2,
    },
  );
  const rejected = expect(pending).rejects.toMatchObject({
    status: 0,
    outcome: "uncertain",
  });
  await vi.advanceTimersByTimeAsync(0);
  caller.abort();
  await rejected;
  finish?.({
    done: false,
    value: new TextEncoder().encode('{"state":"SIGNED_OUT"}'),
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(parse).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledOnce();
  expect(releaseLock).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["constructor", "toString", "__proto__"])(
  "ignores inherited properties in upstream error code %s",
  async (code) => {
    const transport = createNativeTransport(
      base,
      async () => "token",
      async () => Response.json({ error: { code } }, { status: 401 }),
    );
    await expect(
      transport.request("me", authResultSchema, {
        method: "GET",
        signal: signal(),
      }),
    ).rejects.toThrow("Your session has ended. Sign in again.");
  },
);

it("does no token acquisition, network discovery or timer work until explicitly called", async () => {
  vi.useFakeTimers();
  const token = vi.fn(async () => "token"),
    send = vi.fn<NativeSend>();
  createNativeTransport(base, token, send);
  await vi.advanceTimersByTimeAsync(600000);
  expect(token).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
