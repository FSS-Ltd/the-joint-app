import {
  authContinuation,
  readAuthDestination,
  type AuthDestination,
} from "../../lib/auth-continuation";
import type { MeResponse } from "@joint/contracts";

export type Identity = MeResponse;

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
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

export function announceSessionChange(): void {
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
  options: {
    method?: "PATCH" | "PUT" | "DELETE";
    ifMatch?: number;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  try {
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      const csrf = await request<{ csrfToken: string }>(
        "/api/auth/csrf",
        undefined,
        undefined,
        { signal: options.signal },
      );
      headers["Content-Type"] = "application/json";
      headers["X-CSRF-Token"] = csrf.csrfToken;
      if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
      if (options.ifMatch !== undefined)
        headers["If-Match"] = `"${options.ifMatch}"`;
    }
    const response = await fetch(path, {
      method: options.method ?? (body === undefined ? "GET" : "POST"),
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal,
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
      const code =
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof data.error === "object" &&
        data.error !== null &&
        "code" in data.error &&
        typeof data.error.code === "string"
          ? data.error.code
          : undefined;
      throw new RequestError(message, response.status, code);
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

export function nextDestination(): AuthDestination {
  return readAuthDestination(window.location.search);
}

export function finishAuth(state: string): void {
  const next = nextDestination();
  window.location.assign(
    state === "MFA_REQUIRED"
      ? authContinuation("/security", window.location.search)
      : next,
  );
}
