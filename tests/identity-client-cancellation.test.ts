import { afterEach, expect, it, vi } from "vitest";
import { request } from "../apps/web/components/identity/client.js";

afterEach(() => vi.unstubAllGlobals());
it("cancels the CSRF bootstrap as well as the activity request", async () => {
  const abort = new AbortController();
  const fetch = vi.fn(
    (_url: string, options?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => reject(new Error("Aborted")),
          { once: true },
        );
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const pending = request(
    "/api/auth/session",
    { activityAgeMs: 0 },
    undefined,
    { signal: abort.signal },
  );
  expect(fetch.mock.calls[0]?.[1]?.signal).toBe(abort.signal);
  abort.abort();
  await expect(pending).rejects.toMatchObject({ status: 0 });
  expect(fetch).toHaveBeenCalledTimes(1);
});
