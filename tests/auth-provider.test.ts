import { afterEach, expect, it, vi } from "vitest";
import { AuthProvider } from "../apps/api/src/modules/identity/auth-provider.js";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it.each(["http", "network"])(
  "bounds refresh when the provider has a %s outage",
  async (kind) => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => {
      if (kind === "network")
        throw new Error("synthetic upstream network failure");
      return Response.json(
        { message: "synthetic upstream failure" },
        { status: 503 },
      );
    });
    vi.stubGlobal("fetch", fetch);
    const started = Date.now();
    const result = new AuthProvider(
      "http://127.0.0.1:15421/auth/v1",
      "synthetic-public-key",
      50,
    )
      .refresh("synthetic-refresh-token")
      .catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ status: 503 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(100);
  },
);
