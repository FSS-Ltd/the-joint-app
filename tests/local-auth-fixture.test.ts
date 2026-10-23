import { afterEach, expect, it, vi } from "vitest";
import { emailCode } from "./fixtures/local-auth.js";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("uses the configured loopback inbox port for synthetic confirmation codes", async () => {
  vi.stubEnv("MAILPIT_HTTP_PORT", "15555");
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (input: string) => {
    urls.push(input);
    return Response.json(
      urls.length === 1
        ? {
            messages: [
              { ID: "synthetic", To: [{ Address: "test@example.test" }] },
            ],
          }
        : { Text: "Your synthetic code is 123456" },
    );
  });
  expect(await emailCode("test@example.test", new Set())).toBe("123456");
  expect(urls).toEqual([
    "http://127.0.0.1:15555/api/v1/messages",
    "http://127.0.0.1:15555/api/v1/message/synthetic",
  ]);
});
it("rejects an invalid local inbox port before a request without exposing its value", async () => {
  vi.stubEnv("MAILPIT_HTTP_PORT", "synthetic-secret");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(emailCode("test@example.test", new Set())).rejects.toThrow(
    "Invalid environment fields: MAILPIT_HTTP_PORT",
  );
  expect(fetch).not.toHaveBeenCalled();
});
