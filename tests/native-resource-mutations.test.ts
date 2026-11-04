import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAccountsApi } from "../apps/mobile/src/api/accounts.js";
import { createNativeTransport } from "./fixtures/native-api.js";
import { resourceFixture } from "./fixtures/native-resource.js";
import { deferred, flush, householdId } from "./fixtures/native-stream.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("keeps interrupted write uncertainty caller-owned across resource background and foreground", async () => {
  const response = deferred<Response>();
  const send = vi.fn<typeof fetch>(() => response.promise);
  const api = createAccountsApi(
    createNativeTransport(
      "https://synthetic.example.test",
      async () => "token",
      send,
    ),
  );
  const caller = new AbortController();
  const input = {
    label: "Synthetic",
    kind: "CURRENT",
    currency: "GBP",
    liquidity: "AVAILABLE",
  } as const;
  const key = "00000000-0000-4000-8000-000000000009";
  const rejected = expect(
    api.create(householdId, input, key, caller.signal),
  ).rejects.toMatchObject({ status: 0, outcome: "uncertain" });
  const resource = resourceFixture();
  resource.controller.start();
  await flush();
  resource.emit("event: change\ndata: {}\n\n");
  await flush();
  expect(send).toHaveBeenCalledOnce();
  // The resource owns reads only; the caller's lifecycle owns interruption of its write.
  resource.controller.background();
  caller.abort();
  await rejected;
  response.resolve(Response.json({ committed: "unknown" }));
  await flush();
  resource.controller.foreground();
  await flush();
  resource.emit("event: change\ndata: {}\n\n");
  await flush();
  expect(send).toHaveBeenCalledOnce();
  expect(send.mock.calls[0]?.[1]).toMatchObject({
    body: JSON.stringify(input),
    headers: { "Idempotency-Key": key },
  });
  expect(input).toEqual({
    label: "Synthetic",
    kind: "CURRENT",
    currency: "GBP",
    liquidity: "AVAILABLE",
  });
  resource.controller.close();
  expect(vi.getTimerCount()).toBe(0);
});
