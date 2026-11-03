import { vi } from "vitest";
import { Clerk, testPublishableKey } from "./clerk-sdk.js";
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export async function nativeClerkHarness(completed = false) {
  const statuses = new Map([
    ["a", "active"],
    ["b", "active"],
    ["c", "active"],
  ]);
  const calls: string[] = [];
  const delays = new Map<string, Promise<void>>();
  const failures = new Map<string, number>();
  const errorCodes = new Map<string, string>();
  function session(id: string) {
    return {
      object: "session",
      id,
      status: statuses.get(id),
      user: {
        object: "user",
        id: `user_${id}`,
        email_addresses: [],
        phone_numbers: [],
        external_accounts: [],
        organization_memberships: [],
      },
      last_active_at: Date.now(),
      expire_at: Date.now() + 3600000,
      abandon_at: Date.now() + 3600000,
    };
  }
  function client() {
    return {
      object: "client",
      id: "client_test",
      sessions: [...statuses.keys()].map(session),
      sign_in: completed
        ? {
            object: "sign_in",
            id: "signin_complete",
            status: "complete",
            created_session_id: "a",
          }
        : { object: "sign_in", status: "needs_identifier" },
      sign_up: completed
        ? {
            object: "sign_up",
            id: "signup_complete",
            status: "complete",
            created_session_id: "a",
          }
        : { object: "sign_up", status: "missing_requirements" },
      last_active_session_id: "a",
      updated_at: Date.now(),
    };
  }
  const send = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.origin !== "https://synthetic.clerk.accounts.dev")
      throw Error("Network forbidden by SDK fixture");
    const pathname = url.pathname;
    calls.push(pathname);
    const delay = delays.get(pathname);
    if (delay) await delay;
    const status = failures.get(pathname) ?? 200;
    if (status !== 200)
      return new Response(
        JSON.stringify({
          errors: [
            {
              code: errorCodes.get(pathname) ?? "session_not_found",
              message: "private provider detail",
            },
          ],
        }),
        { status },
      );
    let body: unknown;
    if (pathname === "/v1/environment")
      body = {
        response: {
          object: "environment",
          auth_config: { single_session_mode: true },
          display_config: {},
          user_settings: {},
        },
      };
    else if (pathname === "/v1/client") body = { response: client() };
    else {
      const match =
        /^\/v1\/client\/sessions\/([abc])\/(touch|remove|tokens)$/.exec(
          pathname,
        );
      if (!match) throw Error(`Unexpected SDK endpoint: ${pathname}`);
      const id = match[1] ?? "",
        action = match[2];
      if (action === "remove") statuses.set(id, "removed");
      if (action === "tokens") {
        const encode = (value: unknown) =>
          Buffer.from(JSON.stringify(value)).toString("base64url");
        const now = Math.floor(Date.now() / 1000);
        body = {
          object: "token",
          jwt: `${encode({ alg: "RS256" })}.${encode({ sub: `user_${id}`, sid: id, iat: now, exp: now + 600, iss: url.origin })}.synthetic`,
        };
      } else body = { response: session(id), client: client() };
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", send);
  const clerk = new Clerk(testPublishableKey);
  await clerk.load({
    standardBrowser: false,
    telemetry: false,
    polling: false,
  });
  return { clerk, calls, delays, failures, errorCodes, statuses, send };
}
