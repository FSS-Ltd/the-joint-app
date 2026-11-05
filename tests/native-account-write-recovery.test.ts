import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { financeFixture } from "./fixtures/native-finance.js";
import { NativeApiError } from "../apps/mobile/src/api/errors.js";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());
it.each([
  ["MFA_REAUTH_REQUIRED", "security"],
  ["MFA_REQUIRED", "security"],
  ["VERSION_CONFLICT", "reload"],
  ["IDEMPOTENCY_CONFLICT", "reload"],
])(
  "exposes safe %s recovery without parsing display strings",
  async (code, recovery) => {
    const f = await financeFixture();
    const render = () => f.h.render(() => f.mutation("write"));
    await render().submit(async () => {
      throw new NativeApiError(409, code);
    });
    expect(render()).toMatchObject({ kind: "error", recovery });
    f.close();
  },
);
it("keeps an uncertain recovery retryable and refuses replacement intents", async () => {
  const f = await financeFixture(),
    retained = vi.fn(async () => {
      throw new NativeApiError(0, undefined, "uncertain");
    });
  const replacement = vi.fn(async () => "new");
  const render = () => f.h.render(() => f.mutation("write"));
  await render().submit(retained);
  await render().submit(replacement);
  expect(render()).toMatchObject({ kind: "uncertain", recovery: "retry" });
  await render().retry();
  expect(retained).toHaveBeenCalledTimes(2);
  expect(replacement).not.toHaveBeenCalled();
  f.close();
});
