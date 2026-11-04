import { providerError } from "./fixtures/clerk-sdk.js";
import { expect, it, vi } from "vitest";
import { createIdentityApi, IdentityApiError } from "./fixtures/native-api.js";
import { readIdentityConfiguration } from "../apps/mobile/src/features/identity/configuration.js";
import {
  NativeReturnGuard,
  readInvitationLink,
} from "../apps/mobile/src/features/identity/returns.js";
const apiUrl = "https://api.example.test";
it("fails closed on missing/malformed configuration and production cleartext", () => {
  expect(readIdentityConfiguration({}, false).kind).toBe("unconfigured");
  const key = `pk_test_${btoa("example.clerk.accounts.dev$")}`;
  expect(
    readIdentityConfiguration({ publishableKey: key, apiUrl }, false).kind,
  ).toBe("configured");
  expect(
    readIdentityConfiguration(
      {
        publishableKey: key,
        apiUrl: "http://127.0.0.1:3001",
        allowLocalHttp: "true",
      },
      false,
    ).kind,
  ).toBe("unconfigured");
  expect(
    readIdentityConfiguration(
      {
        publishableKey: key,
        apiUrl: "http://127.0.0.1:3001",
        allowLocalHttp: "true",
      },
      true,
    ).kind,
  ).toBe("configured");
  expect(
    readIdentityConfiguration(
      {
        publishableKey: key,
        apiUrl: "http://evil.test",
        allowLocalHttp: "true",
      },
      true,
    ).kind,
  ).toBe("unconfigured");
});
it("validates replies, never follows redirects and preserves idempotency on unchanged writes", async () => {
  const send = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify({ bad: true }), { status: 200 }),
  );
  const api = createIdentityApi(apiUrl, async () => "session-token", send);
  await expect(api.readMe(new AbortController().signal)).rejects.toBeInstanceOf(
    IdentityApiError,
  );
  const key = "00000000-0000-4000-8000-000000000001";
  for (let i = 0; i < 2; i++)
    await expect(
      api.createHousehold("Our home", key, new AbortController().signal),
    ).rejects.toThrow();
  expect(send.mock.calls.map((c) => c[1]?.headers)).toHaveLength(3);
  expect(send.mock.calls[1]?.[1]).toMatchObject({
    redirect: "error",
    headers: { "Idempotency-Key": key, Authorization: "Bearer session-token" },
  });
});
it("aborts before token acquisition and uses safe wrong-adult feedback", async () => {
  const token = vi.fn(async () => "token");
  const send = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "INVITATION_UNAVAILABLE",
            message: "private internal data",
          },
        }),
        { status: 404 },
      ),
  );
  const api = createIdentityApi(apiUrl, token, send);
  const abort = new AbortController();
  abort.abort();
  await expect(api.readMe(abort.signal)).rejects.toThrow();
  expect(token).not.toHaveBeenCalled();
  await expect(
    api.acceptInvitation("a".repeat(43), new AbortController().signal),
  ).rejects.toThrow("another verified email");
});
it("rejects absent, expired, replayed and wrong-destination auth returns", () => {
  const guard = new NativeReturnGuard("familyfund://auth-return", () => 100);
  expect(guard.consume("familyfund://auth-return?rotating_token_nonce=n")).toBe(
    false,
  );
  guard.begin();
  expect(guard.consume("familyfund://other?rotating_token_nonce=n")).toBe(
    false,
  );
  guard.begin();
  expect(guard.consume("familyfund://auth-return?rotating_token_nonce=n")).toBe(
    true,
  );
  expect(guard.consume("familyfund://auth-return?rotating_token_nonce=n")).toBe(
    false,
  );
  let time = 0;
  const expired = new NativeReturnGuard("familyfund://auth-return", () => time);
  expired.begin();
  time = 600001;
  expect(
    expired.consume("familyfund://auth-return?rotating_token_nonce=n"),
  ).toBe(false);
  guard.begin();
  expect(guard.consume("familyfund://auth-return?session_id=evil")).toBe(false);
});
it("keeps invitation links separate and never accepts arbitrary redirect or identity tokens", () => {
  const token = "a".repeat(43);
  expect(readInvitationLink(`familyfund://invitation?token=${token}`)).toBe(
    token,
  );
  expect(readInvitationLink(`familyfund://auth-return?token=${token}`)).toBe(
    null,
  );
  expect(
    readInvitationLink(
      `familyfund://invitation?token=${token}&redirectUrl=https://evil.test`,
    ),
  ).toBe(null);
});
it("bounds token acquisition before issuing any network request", async () => {
  vi.useFakeTimers();
  try {
    const send = vi.fn<typeof fetch>();
    const api = createIdentityApi(apiUrl, () => new Promise(() => {}), send);
    const read = api.readMe(new AbortController().signal);
    const rejected = expect(read).rejects.toBeInstanceOf(IdentityApiError);
    await vi.advanceTimersByTimeAsync(15000);
    await rejected;
    expect(send).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it("rejects malformed, duplicate, credential-bearing and foreign callback destinations", () => {
  const guard = new NativeReturnGuard("familyfund://auth-return");
  for (const url of [
    "not a url",
    "https://auth-return?rotating_token_nonce=a",
    "familyfund://evil@auth-return?rotating_token_nonce=a",
    "familyfund://auth-return/path?rotating_token_nonce=a",
    "familyfund://auth-return?rotating_token_nonce=a&rotating_token_nonce=b",
    "familyfund://auth-return?rotating_token_nonce=a#fragment",
  ]) {
    guard.begin();
    expect(guard.consume(url)).toBe(false);
  }
});
it("keeps unauthorized status authoritative even when an error body is not JSON", async () => {
  const api = createIdentityApi(
    apiUrl,
    async () => "token",
    async () => new Response("Unauthorized", { status: 401 }),
  );
  await expect(api.readMe(new AbortController().signal)).rejects.toMatchObject({
    status: 401,
  });
});

it("preserves recognized terminal SDK acquisition rejection without private messages", async () => {
  const send = vi.fn<typeof fetch>();
  const api = createIdentityApi(
    apiUrl,
    async () => {
      throw providerError(401);
    },
    send,
  );
  await expect(api.readMe(new AbortController().signal)).rejects.toMatchObject({
    status: 401,
  });
  expect(send).not.toHaveBeenCalled();
});

it.each([403, 429, 503])(
  "classifies SDK acquisition status %i without leaking messages",
  async (status) => {
    const api = createIdentityApi(
      apiUrl,
      async () => {
        throw providerError(status);
      },
      vi.fn(),
    );
    await expect(
      api.readMe(new AbortController().signal),
    ).rejects.toMatchObject({ status: status === 403 ? 401 : 0 });
    await expect(api.readMe(new AbortController().signal)).rejects.not.toThrow(
      "private provider detail",
    );
  },
);
it("does not treat a lookalike or transport failure as terminal SDK rejection", async () => {
  for (const cause of [
    { status: 404, errors: [{ code: "session_not_found" }] },
    { status: 401 },
    new Error("network"),
    new DOMException("cancelled", "AbortError"),
  ]) {
    const api = createIdentityApi(
      apiUrl,
      async () => {
        throw cause;
      },
      vi.fn(),
    );
    await expect(
      api.readMe(new AbortController().signal),
    ).rejects.toMatchObject({ status: 0 });
  }
});

it.each(["not_found", "configuration_not_found"])(
  "keeps recognized but unrelated404 %s unconfirmed",
  async (code) => {
    const api = createIdentityApi(
      apiUrl,
      async () => {
        throw providerError(404, code);
      },
      vi.fn(),
    );
    await expect(
      api.readMe(new AbortController().signal),
    ).rejects.toMatchObject({ status: 0 });
  },
);

it.each(["deadline", "caller"] as const)(
  "settles and cancels a stalled identity body on %s cancellation",
  async (reason) => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({ cancel });
      const caller = new AbortController();
      const api = createIdentityApi(
        apiUrl,
        async () => "token",
        async () => new Response(body),
      );
      let outcome = "pending";
      const read = api.readMe(caller.signal).then(
        () => {
          outcome = "resolved";
        },
        () => {
          outcome = "rejected";
        },
      );
      await vi.advanceTimersByTimeAsync(0);
      if (reason === "caller") caller.abort();
      await vi.advanceTimersByTimeAsync(15000);
      expect(outcome).toBe("rejected");
      await read;
      expect(cancel).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  },
);

it("cancels oversized JSON and never exposes upstream details", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(1048577));
    },
    cancel,
  });
  const api = createIdentityApi(
    apiUrl,
    async () => "token",
    async () => new Response(body),
  );
  await expect(api.readMe(new AbortController().signal)).rejects.toBeInstanceOf(
    IdentityApiError,
  );
  expect(cancel).toHaveBeenCalledOnce();
});

it("settles an ignored send cancellation and disposes a late response", async () => {
  vi.useFakeTimers();
  try {
    let finish: ((response: Response) => void) | undefined;
    const cancel = vi.fn();
    const api = createIdentityApi(
      apiUrl,
      async () => "token",
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let outcome = "pending";
    const read = api.readMe(new AbortController().signal).catch(() => {
      outcome = "rejected";
    });
    await vi.advanceTimersByTimeAsync(15000);
    expect(outcome).toBe("rejected");
    finish?.(new Response(new ReadableStream({ cancel })));
    await read;
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("retains cleanup-ticket authorization on only the retry endpoint", async () => {
  const token = vi.fn(async () => "token");
  const send = vi.fn<typeof fetch>(async () =>
    Response.json({ state: "SIGNED_OUT" }),
  );
  const api = createIdentityApi(apiUrl, token, send);
  await api.retryLogoutCleanup("v1.abc.def.ghi", new AbortController().signal);
  expect(token).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledWith(
    `${apiUrl}/v1/auth/logout/retry`,
    expect.objectContaining({
      method: "POST",
      body: "{}",
      credentials: "omit",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Logout-Cleanup": "v1.abc.def.ghi",
      },
    }),
  );
  expect(() =>
    api.retryLogoutCleanup("invalid", new AbortController().signal),
  ).toThrow();
});
