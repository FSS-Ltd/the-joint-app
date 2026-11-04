import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { financeFixture } from "./fixtures/native-finance.js";
import { deferred, flush } from "./fixtures/native-stream.js";
import { NativeApiError } from "../apps/mobile/src/api/errors.js";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());
it("keeps uncertain outcome and retries only the same captured operation on deliberate retry", async () => {
  const f = await financeFixture();
  const execute = vi.fn(async () => {
    throw new NativeApiError(0, undefined, "uncertain");
  });
  const render = () =>
    f.h.render(() => f.mutation<string>("account:fixed-version:key"));
  await render().submit(execute);
  expect(render().kind).toBe("uncertain");
  await flush();
  expect(execute).toHaveBeenCalledOnce();
  await render().retry();
  expect(execute).toHaveBeenCalledTimes(2);
  render().reset();
  await render().retry();
  expect(execute).toHaveBeenCalledTimes(2);
  f.close();
});
it.each(["identity", "blur", "background"])(
  "clears captured operation on %s loss and ignores a late successful write",
  async (loss) => {
    const f = await financeFixture();
    const pending = deferred<string>();
    const execute = vi.fn<(signal: AbortSignal) => Promise<string>>(
      () => pending.promise,
    );
    const render = () => f.h.render(() => f.mutation<string>("account"));
    const task = render().submit(execute);
    expect(render().kind).toBe("pending");
    if (loss === "identity") f.controller.blockMutations();
    if (loss === "blur") f.h.focus(false);
    if (loss === "background") f.h.app("background");
    expect(execute.mock.calls[0]?.[0].aborted).toBe(true);
    pending.resolve("old actor write");
    await task;
    expect(render().kind).toBe("idle");
    await render().retry();
    expect(execute).toHaveBeenCalledOnce();
    f.close();
  },
);
it("masks target replacement before cleanup and drops its old retry closure", async () => {
  const f = await financeFixture();
  const pending = deferred<string>();
  const execute = vi.fn<(signal: AbortSignal) => Promise<string>>(
    () => pending.promise,
  );
  const old = f.h.render(() => f.mutation<string>("old-account"));
  const write = old.submit(execute);
  expect(f.h.render(() => f.mutation<string>("new-account"), false).kind).toBe(
    "idle",
  );
  f.h.render(() => f.mutation<string>("new-account"));
  expect(execute.mock.calls[0]?.[0].aborted).toBe(true);
  pending.resolve("old");
  await write;
  await old.retry();
  expect(execute).toHaveBeenCalledOnce();
  f.close();
});
it("distinguishes a cancelled pre-dispatch write from dispatched uncertainty and never sends a late token", async () => {
  const { createNativeTransport } = await import("./fixtures/native-api.js");
  const { createAccountsApi } =
    await import("../apps/mobile/src/api/accounts.js");
  const f = await financeFixture();
  const token = deferred<string>();
  const send = vi.fn<typeof fetch>();
  const accounts = createAccountsApi(
    createNativeTransport("https://synthetic.test", () => token.promise, send),
  );
  const execute = vi.fn((signal: AbortSignal) =>
    accounts.create(
      f.finance.authority.householdId,
      {
        label: "Captured",
        kind: "CURRENT",
        currency: "GBP",
        liquidity: "AVAILABLE",
      },
      "00000000-0000-4000-8000-000000000009",
      signal,
    ),
  );
  const mutation = f.h.render(() => f.mutation("create"));
  const write = mutation.submit(execute);
  f.h.app("background");
  token.resolve("late-token");
  await write;
  await flush();
  expect(send).not.toHaveBeenCalled();
  expect(f.h.render(() => f.mutation("create")).kind).toBe("idle");
  f.close();
});
it("retries the identical serialized key, version and payload after an uncertain dispatched write", async () => {
  const { createNativeTransport } = await import("./fixtures/native-api.js");
  const { createAccountsApi } =
    await import("../apps/mobile/src/api/accounts.js");
  const f = await financeFixture();
  const send = vi.fn<typeof fetch>(async () => {
    throw Error("unknown committed outcome");
  });
  const accounts = createAccountsApi(
    createNativeTransport("https://synthetic.test", async () => "token", send),
  );
  const input = Object.freeze({
    money: Object.freeze({ amountMinor: "123", currency: "GBP" as const }),
    asOfDate: "2026-11-04",
  });
  const key = "00000000-0000-4000-8000-000000000009";
  const execute = (signal: AbortSignal) =>
    accounts.value(
      f.finance.authority.householdId,
      "00000000-0000-4000-8000-000000000008",
      input,
      key,
      7,
      signal,
    );
  const render = () => f.h.render(() => f.mutation("value:7:captured-key"));
  await render().submit(execute);
  expect(render().kind).toBe("uncertain");
  await render().retry();
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1]?.[1]).toEqual(
    send.mock.calls[0]?.[1] && {
      ...send.mock.calls[0][1],
      signal: send.mock.calls[1]?.[1]?.signal,
    },
  );
  expect(send.mock.calls[0]?.[1]).toMatchObject({
    body: JSON.stringify(input),
    headers: { "Idempotency-Key": key, "If-Match": '"7"' },
  });
  f.close();
});
it.each([
  ["VERSION_CONFLICT", /latest details/],
  ["MFA_REAUTH_REQUIRED", /fresh authenticator/],
  ["SCOPE_REQUIRED", /up to 50/],
  ["IDEMPOTENCY_CONFLICT", /different details/],
] as const)(
  "maps actionable %s feedback without upstream text or automatic replay",
  async (code, expectedMessage) => {
    const f = await financeFixture();
    const execute = vi.fn(async () => {
      throw new NativeApiError(
        code === "MFA_REAUTH_REQUIRED" ? 403 : 409,
        code,
      );
    });
    const render = () => f.h.render(() => f.mutation("fixed"));
    await render().submit(execute);
    const state = render();
    expect(state.kind).toBe("error");
    expect(state).toHaveProperty("message");
    expect("message" in state && state.message).toMatch(expectedMessage);
    expect("message" in state && state.message).not.toContain("private");
    expect(f.api.readMe).toHaveBeenCalledOnce();
    await flush();
    expect(execute).toHaveBeenCalledOnce();
    f.close();
  },
);
it("fences mutation success when explicit sharing reconciliation changes identity inside its closure", async () => {
  const f = await financeFixture();
  const render = () =>
    f.h.render(() => f.mutation<string>("grant:account:version"));
  await render().submit(async () => {
    await f.finance.reconcile(f.finance.authority);
    return "obsolete grant dto";
  });
  expect(render().kind).toBe("idle");
  await render().retry();
  expect(f.api.readMe).toHaveBeenCalledTimes(2);
  f.close();
});
it("blocks duplicate submissions while pending and does not revoke a replacement actor for late401", async () => {
  const f = await financeFixture();
  const pending = deferred<string>();
  const execute = vi.fn(() => pending.promise);
  const render = () => f.h.render(() => f.mutation<string>("account"));
  const write = render().submit(execute);
  await render().submit(execute);
  expect(execute).toHaveBeenCalledOnce();
  await f.controller.identify("replacement:session");
  pending.reject(new NativeApiError(401));
  await write;
  expect(f.controller.getVerifiedIdentity()?.actor).toBe("replacement:session");
  expect(render().kind).toBe("idle");
  f.close();
});
it("revokes the current captured actor on401 but never publishes private unknown errors", async () => {
  const f = await financeFixture();
  const render = () => f.h.render(() => f.mutation("account"));
  await render().submit(async () => {
    throw new Error("private upstream detail");
  });
  const state = render();
  expect(state.kind).toBe("error");
  expect("message" in state && state.message).not.toContain("private");
  await render().submit(async () => {
    throw new NativeApiError(401);
  });
  expect(f.controller.getSnapshot()).toEqual({
    kind: "locked",
    reason: "expired",
  });
  expect(render().kind).toBe("idle");
  f.close();
});
