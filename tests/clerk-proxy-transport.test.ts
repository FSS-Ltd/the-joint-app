import { describe, expect, it } from "vitest";
import {
  clerkProxyHeaders,
  clerkProxyUrl,
  totpOperation,
} from "../apps/api/src/modules/identity/clerk/proxy-transport.js";

describe("Clerk proxy transport boundary", () => {
  it("uses only the configured provider origin and rejects unsafe paths", () => {
    expect(
      clerkProxyUrl("https://test.clerk.accounts.dev", "/v1/client?x=1"),
    ).toBe("https://test.clerk.accounts.dev/v1/client?x=1");
    for (const path of [
      "//evil.example/",
      "/\\evil.example/",
      "/v1/../evil",
      "https://evil.example/",
    ]) {
      expect(clerkProxyUrl("https://test.clerk.accounts.dev", path)).toBeNull();
    }
    expect(clerkProxyUrl("http://evil.example", "/v1/client")).toBeNull();
  });
  it("forwards SDK auth while overriding spoofed proxy and client IP headers", () => {
    const headers = clerkProxyHeaders(
      {
        authorization: "sdk-token",
        "x-forwarded-for": "spoofed",
        "clerk-secret-key": "spoofed",
        "user-agent": "native JointMFA2.ATTACKER",
      },
      "real-provider-secret",
      "127.0.0.1",
      "JointMFA2.ABC123",
    );
    expect(headers.get("authorization")).toBe("sdk-token");
    expect(headers.get("x-forwarded-for")).toBe("127.0.0.1");
    expect(headers.get("clerk-secret-key")).toBe("real-provider-secret");
    expect(headers.get("user-agent")).toBe("native JointMFA2.ABC123");
  });
  it("recognizes only exact POST verification paths", () => {
    expect(totpOperation("POST", "/v1/me/totp/attempt_verification")).toBe(
      "enrollment",
    );
    expect(
      totpOperation(
        "POST",
        "/v1/client/sign_ins/sia_123/attempt_second_factor",
      ),
    ).toBe("sign-in");
    expect(totpOperation("GET", "/v1/me/totp/attempt_verification")).toBeNull();
    expect(
      totpOperation("POST", "/v1/me/totp/attempt_verification/extra"),
    ).toBeNull();
  });
});

it("accepts only a fixed HTTPS proxy URL or loopback development URL", async () => {
  const { clerkProxyUrlSchema } =
    await import("../packages/contracts/src/clerk.js");
  expect(
    clerkProxyUrlSchema.safeParse("http://127.0.0.1:3003/v1/clerk").success,
  ).toBe(true);
  expect(
    clerkProxyUrlSchema.safeParse("https://api.example.test/v1/clerk").success,
  ).toBe(true);
  for (const value of [
    "http://api.example.test/v1/clerk",
    "https://api.example.test/other",
    "https://api.example.test/v1/clerk?x=1",
    "https://user@api.example.test/v1/clerk",
  ]) {
    expect(clerkProxyUrlSchema.safeParse(value).success).toBe(false);
  }
});

it("limits verification attempts by actual peer with bounded state", async () => {
  const { createProxyRateLimit } =
    await import("../apps/api/src/modules/identity/clerk/proxy-transport.js");
  const limit = createProxyRateLimit({
    maximum: 2,
    windowMs: 1000,
    maxPeers: 2,
  });
  expect(limit("a", 100)).toBe(true);
  expect(limit("a", 101)).toBe(true);
  expect(limit("a", 102)).toBe(false);
  expect(limit("b", 102)).toBe(true);
  expect(limit("c", 103)).toBe(false);
  expect(limit("a", 1100)).toBe(true);
});

it("creates proof operations only for unambiguous six-digit TOTP form submissions", async () => {
  const { eligibleTotpOperation } =
    await import("../apps/api/src/modules/identity/clerk/proxy-transport.js");
  const type = "application/x-www-form-urlencoded";
  expect(
    eligibleTotpOperation("enrollment", type, Buffer.from("code=123456")),
  ).toBe(true);
  expect(
    eligibleTotpOperation(
      "sign-in",
      type,
      Buffer.from("strategy=totp&code=123456"),
    ),
  ).toBe(true);
  for (const body of [
    "strategy=email_code&code=123456",
    "strategy=backup_code&code=123456",
    "strategy=totp&code=123456&code=000000",
    "strategy=totp&code=bad",
  ]) {
    expect(eligibleTotpOperation("sign-in", type, Buffer.from(body))).toBe(
      false,
    );
  }
});

it("requires one explicit enrollment session selector", async () => {
  const { enrollmentSessionSelector } =
    await import("../apps/api/src/modules/identity/clerk/proxy-transport.js");
  expect(
    enrollmentSessionSelector(
      "/v1/me/totp/attempt_verification?_clerk_session_id=sess_123",
    ),
  ).toBe("sess_123");
  expect(
    enrollmentSessionSelector("/v1/me/totp/attempt_verification"),
  ).toBeNull();
  expect(
    enrollmentSessionSelector(
      "/v1/me/totp/attempt_verification?_clerk_session_id=sess_123&_clerk_session_id=sess_456",
    ),
  ).toBeNull();
});
