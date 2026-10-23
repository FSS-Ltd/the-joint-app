import { readAuthProvider } from "@joint/contracts";
import { resolveClerkSessionToken } from "./clerk-session";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { BffError } from "./responses";

export const LOGOUT_CLEANUP_COOKIE = "joint-logout-cleanup";
const cleanupPattern = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
function validCookie(name: string, value: string): boolean {
  return name === LOGOUT_CLEANUP_COOKIE
    ? value.length <= 4096 && cleanupPattern.test(value)
    : tokenPattern.test(value);
}

export const SESSION_COOKIE = "joint-session";
export const CSRF_COOKIE = "joint-csrf";
export const INVITATION_COOKIE = "joint-pending-invite";
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

function webOrigin(): URL {
  const url = new URL(process.env.WEB_ORIGIN ?? "http://127.0.0.1:3000");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && isLoopback(url.hostname)))
  ) {
    throw new BffError(
      503,
      "UNAVAILABLE",
      "This service is unavailable. Please try again shortly.",
    );
  }
  return url;
}

function isLoopback(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

export function readCookie(request: Request, name: string): string | null {
  const matches = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const value = matches[0]?.slice(name.length + 1) ?? "";
  return validCookie(name, value) ? value : null;
}

export function setCookie(
  response: Response,
  name: string,
  value: string,
  maxAge: number,
  sameSite: "Lax" | "Strict",
): void {
  if (value && !validCookie(name, value))
    throw new BffError(
      503,
      "INVALID_RESPONSE",
      "This service is unavailable. Please try again shortly.",
    );
  const secure = isLoopback(webOrigin().hostname) ? "" : "; Secure";
  response.headers.append(
    "Set-Cookie",
    `${name}=${value}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}${secure}`,
  );
}

export function newCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function assertMutation(request: Request): void {
  if (request.headers.get("origin") !== webOrigin().origin)
    throw new BffError(
      403,
      "ORIGIN_REJECTED",
      "This request could not be verified. Reload the page and try again.",
    );
  const cookie = readCookie(request, CSRF_COOKIE);
  const header = request.headers.get("x-csrf-token");
  if (
    !cookie ||
    !header ||
    !tokenPattern.test(header) ||
    !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))
  ) {
    throw new BffError(
      403,
      "CSRF_REJECTED",
      "This request could not be verified. Reload the page and try again.",
    );
  }
}

export async function sessionToken(request: Request): Promise<string> {
  let mode: "local" | "clerk";
  try {
    mode = readAuthProvider(process.env);
  } catch {
    throw new BffError(
      503,
      "UNAVAILABLE",
      "Sign-in configuration is unavailable.",
    );
  }
  if (mode === "clerk") return resolveClerkSessionToken();
  const token = readCookie(request, SESSION_COOKIE);
  if (!token)
    throw new BffError(401, "SIGN_IN_REQUIRED", "Please sign in to continue.");
  return token;
}
