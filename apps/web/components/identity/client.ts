import type { MeResponse } from "@joint/contracts";

export type Identity = MeResponse;

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const sessionMutations = new Set([
  "/api/auth/login",
  "/api/auth/verify",
  "/api/auth/mfa/verify",
  "/api/auth/logout",
  "/api/auth/password",
]);
let sessionChannel: BroadcastChannel | undefined;
let sessionListeners = 0;

function announceSessionChange(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel =
    sessionChannel ?? new BroadcastChannel("joint-session-events");
  channel.postMessage("SESSION_CHANGED");
  if (channel !== sessionChannel) channel.close();
}

export function subscribeSessionChanges(onChange: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = (sessionChannel ??= new BroadcastChannel(
    "joint-session-events",
  ));
  const listener = (event: MessageEvent<unknown>) => {
    if (event.data === "SESSION_CHANGED") onChange();
  };
  sessionListeners++;
  channel.addEventListener("message", listener);
  return () => {
    channel.removeEventListener("message", listener);
    sessionListeners--;
    if (sessionListeners === 0 && sessionChannel === channel) {
      channel.close();
      sessionChannel = undefined;
    }
  };
}

export async function request<T>(
  path: string,
  body?: object,
  idempotencyKey?: string,
): Promise<T> {
  try {
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      const csrf = await request<{ csrfToken: string }>("/api/auth/csrf");
      headers["Content-Type"] = "application/json";
      headers["X-CSRF-Token"] = csrf.csrfToken;
      if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    }
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      const message =
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof data.error === "object" &&
        data.error !== null &&
        "message" in data.error &&
        typeof data.error.message === "string"
          ? data.error.message
          : "This request could not be completed. Please try again.";
      throw new RequestError(message, response.status);
    }
    if (body !== undefined && sessionMutations.has(path))
      announceSessionChange();
    // First-party BFF routes validate successful responses against shared schemas.
    // Restore that typed contract after JSON parsing; provider responses never reach this boundary.
    return data as T;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(
      "We could not connect. Check your connection and try again.",
      0,
    );
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof RequestError
    ? error.message
    : "Something went wrong. Please try again.";
}

export function nextDestination(): "/join" | "/household" {
  return new URLSearchParams(window.location.search).get("next") === "join"
    ? "/join"
    : "/household";
}

export function finishAuth(state: string): void {
  const next = nextDestination();
  window.location.assign(
    state === "MFA_REQUIRED"
      ? `/security${next === "/join" ? "?next=join" : ""}`
      : next,
  );
}
