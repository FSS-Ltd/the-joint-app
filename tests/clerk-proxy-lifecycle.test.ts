import { describe, expect, it, vi } from "vitest";
import { captureProxyTotp } from "../apps/api/src/modules/identity/clerk/proxy-capture.js";

const candidate = {
  subject: "user_123",
  sessionId: "sess_123",
  token: "signed-token",
};
const credential = {
  subject: candidate.subject,
  sessionId: candidate.sessionId,
  totpEnrolled: true,
};
describe("proxy proof capture", () => {
  it("records verified provider TOTP using original time and retries one operation", async () => {
    const verify = vi.fn().mockResolvedValue(credential);
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(undefined);
    const status = vi.fn().mockResolvedValue(false);
    await captureProxyTotp({
      action: "sign-in",
      candidate,
      operationId: "op",
      verifiedAt: 123,
      verify,
      complete,
      status,
    });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenNthCalledWith(2, {
      operationId: "op",
      credential,
      verifiedAt: 123,
    });
  });
  it("never records another subject, another session, or disabled TOTP", async () => {
    for (const value of [
      { ...credential, subject: "user_other" },
      { ...credential, sessionId: "sess_other" },
      { ...credential, totpEnrolled: false },
    ]) {
      const complete = vi.fn();
      await captureProxyTotp({
        action: "sign-in",
        candidate,
        operationId: "op",
        verifiedAt: 123,
        verify: async () => value,
        complete,
        status: async () => false,
      });
      expect(complete).not.toHaveBeenCalled();
    }
  });
  it("treats a confirmed ambiguous commit as complete", async () => {
    const complete = vi.fn().mockRejectedValue(new Error("connection lost"));
    const status = vi.fn().mockResolvedValue(true);
    await captureProxyTotp({
      action: "sign-in",
      candidate,
      operationId: "op",
      verifiedAt: 123,
      verify: async () => credential,
      complete,
      status,
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledWith({ operationId: "op", credential });
  });
});

it("forwards successful SDK response and authorization after attempting proof capture", async () => {
  const { createServer } = await import("node:http");
  const { createClerkProxy } =
    await import("../apps/api/src/modules/identity/clerk/proxy.js");
  const complete = vi.fn().mockResolvedValue(undefined);
  const proxy = createClerkProxy({
    issuer: "https://test.clerk.accounts.dev",
    proxyUrl: "http://127.0.0.1:3003/v1/clerk",
    secret: "test-secret",
    timeoutMs: 1000,
    begin: vi.fn().mockResolvedValue("op"),
    complete,
    status: vi.fn().mockResolvedValue(false),
    verify: vi.fn().mockResolvedValue(credential),
    fetcher: vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          response: {
            status: "complete",
            created_session_id: "sess_123",
            second_factor_verification: {
              strategy: "totp",
              status: "verified",
            },
          },
          client: {
            last_active_session_id: "sess_123",
            sessions: [
              {
                id: "sess_123",
                user: { id: "user_123" },
                last_active_token: { jwt: "token" },
              },
            ],
          },
        }),
        {
          status: 200,
          headers: {
            authorization: "rotated-token",
            "content-type": "application/json",
          },
        },
      ),
    ),
  });
  const server = createServer((request, response) => {
    void proxy(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("missing address");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/v1/client/sign_ins/sia_123/attempt_second_factor`,
      {
        method: "POST",
        headers: {
          authorization: "client-token",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "strategy=totp&code=123456",
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("authorization")).toBe("rotated-token");
    expect(complete).toHaveBeenCalledOnce();
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it("fails before forwarding a code when checkpoint creation fails", async () => {
  const { createServer } = await import("node:http");
  const { createClerkProxy } =
    await import("../apps/api/src/modules/identity/clerk/proxy.js");
  const fetcher = vi.fn();
  const proxy = createClerkProxy({
    issuer: "https://test.clerk.accounts.dev",
    proxyUrl: "http://127.0.0.1:3003/v1/clerk",
    secret: "test-secret",
    timeoutMs: 1000,
    begin: vi.fn().mockRejectedValue(new Error("unavailable")),
    complete: vi.fn(),
    status: vi.fn(),
    verify: vi.fn(),
    fetcher,
  });
  const server = createServer((request, response) => {
    void proxy(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("missing address");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/v1/me/totp/attempt_verification?_clerk_session_id=sess_123`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "code=123456",
      },
    );
    expect(response.status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it("never credits an enrollment response for a different requested session", async () => {
  const { createServer } = await import("node:http");
  const { createClerkProxy } =
    await import("../apps/api/src/modules/identity/clerk/proxy.js");
  const complete = vi.fn();
  const proxy = createClerkProxy({
    issuer: "https://test.clerk.accounts.dev",
    proxyUrl: "http://127.0.0.1:3003/v1/clerk",
    secret: "test-secret",
    timeoutMs: 1000,
    begin: vi.fn().mockResolvedValue("op"),
    complete,
    status: vi.fn(),
    verify: vi.fn().mockResolvedValue(credential),
    fetcher: vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            response: { verified: true },
            client: {
              last_active_session_id: "sess_123",
              sessions: [
                {
                  id: "sess_123",
                  user: { id: "user_123" },
                  last_active_token: { jwt: "token" },
                },
              ],
            },
          }),
          { status: 200 },
        ),
      ),
  });
  const server = createServer((request, response) => {
    void proxy(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("missing address");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/v1/me/totp/attempt_verification?_clerk_session_id=sess_other`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "code=123456",
      },
    );
    expect(response.status).toBe(200);
    expect(complete).not.toHaveBeenCalled();
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
