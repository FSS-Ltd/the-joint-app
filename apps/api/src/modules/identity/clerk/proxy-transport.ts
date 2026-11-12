import type { IncomingHttpHeaders } from "node:http";

export type TotpOperation = "sign-in" | "enrollment";
const markerPattern = /JointMFA2\.[A-Za-z0-9_-]*/g;
const forwardedHeaders = [
  "accept",
  "content-type",
  "authorization",
  "user-agent",
  "x-mobile",
  "x-expo-sdk-version",
  "clerk-js-version",
  "clerk-js-variant",
] as const;

export function clerkProxyUrl(issuer: string, path: string): string | null {
  try {
    const origin = new URL(issuer);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      return null;
    if (
      !path.startsWith("/v1/") ||
      path.includes("\\") ||
      Array.from(path).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      })
    )
      return null;
    const rawPath = path.split("?", 1)[0];
    if (!rawPath) return null;
    for (const part of rawPath.split("/")) {
      const decoded = decodeURIComponent(part);
      if (
        decoded === "." ||
        decoded === ".." ||
        decoded.includes("/") ||
        decoded.includes("\\")
      )
        return null;
    }
    const target = new URL(path, origin);
    return target.origin === origin.origin ? target.href : null;
  } catch {
    return null;
  }
}

export function totpOperation(
  method: string | undefined,
  path: string,
): TotpOperation | null {
  if (method !== "POST") return null;
  const pathname = path.split("?", 1)[0];
  if (pathname === "/v1/me/totp/attempt_verification") return "enrollment";
  if (
    pathname &&
    /^\/v1\/client\/sign_ins\/sia_[A-Za-z0-9]+\/attempt_second_factor$/.test(
      pathname,
    )
  )
    return "sign-in";
  return null;
}

export function clerkProxyHeaders(
  incoming: IncomingHttpHeaders,
  secret: string,
  peerAddress: string,
  marker?: string,
): Headers {
  const result = new Headers();
  for (const name of forwardedHeaders) {
    const value = incoming[name];
    if (typeof value === "string" && name !== "user-agent")
      result.set(name, value);
  }
  const agent =
    typeof incoming["user-agent"] === "string"
      ? incoming["user-agent"].replace(markerPattern, "").trim().slice(0, 512)
      : "";
  if (agent || marker)
    result.set("user-agent", [agent, marker].filter(Boolean).join(" "));
  result.set("clerk-secret-key", secret);
  result.set("x-forwarded-for", peerAddress);
  result.set("accept-encoding", "identity");
  return result;
}

export function createProxyRateLimit(options: {
  maximum: number;
  windowMs: number;
  maxPeers: number;
}): (peer: string, now: number) => boolean {
  const peers = new Map<string, { count: number; expiresAt: number }>();
  return (peer, now) => {
    let current = peers.get(peer);
    if (current && current.expiresAt <= now) {
      peers.delete(peer);
      current = undefined;
    }
    if (!current) {
      if (peers.size >= options.maxPeers) {
        for (const [key, value] of peers)
          if (value.expiresAt <= now) peers.delete(key);
      }
      if (peers.size >= options.maxPeers) return false;
      current = { count: 0, expiresAt: now + options.windowMs };
      peers.set(peer, current);
    }
    if (current.count >= options.maximum) return false;
    current.count++;
    return true;
  };
}

export function eligibleTotpOperation(
  action: TotpOperation,
  contentType: string | undefined,
  body: Uint8Array,
): boolean {
  if (
    contentType?.split(";")[0]?.trim().toLowerCase() !==
    "application/x-www-form-urlencoded"
  )
    return false;
  const form = new URLSearchParams(Buffer.from(body).toString("utf8"));
  const codes = form.getAll("code");
  if (codes.length !== 1 || !/^\d{6}$/.test(codes[0] ?? "")) return false;
  const strategies = form.getAll("strategy");
  return action === "sign-in"
    ? strategies.length === 1 && strategies[0] === "totp"
    : strategies.length === 0;
}

export function enrollmentSessionSelector(path: string): string | null {
  try {
    const selectors = new URL(
      path,
      "https://proxy.invalid",
    ).searchParams.getAll("_clerk_session_id");
    const value = selectors[0];
    return selectors.length === 1 && value && /^sess_[A-Za-z0-9]+$/.test(value)
      ? value
      : null;
  } catch {
    return null;
  }
}
