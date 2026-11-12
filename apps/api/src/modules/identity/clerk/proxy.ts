import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { captureProxyTotp } from "./proxy-capture.js";
import { providerTotpCandidate } from "./proxy-proof.js";
import {
  clerkProxyHeaders,
  createProxyRateLimit,
  eligibleTotpOperation,
  enrollmentSessionSelector,
  clerkProxyUrl,
  totpOperation,
  type TotpOperation,
} from "./proxy-transport.js";

type BoundCredential = {
  subject: string;
  sessionId: string;
  totpEnrolled: boolean;
};
const MAX_BYTES = 1_048_576;
const MAX_IN_FLIGHT = 32;

async function readRequest(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BYTES) throw new Error("Request too large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}
async function readResponse(response: Response): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BYTES) throw new Error("Response too large");
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel();
  }
}

export function createClerkProxy<T extends BoundCredential>(options: {
  issuer: string;
  proxyUrl: string;
  secret: string;
  timeoutMs: number;
  begin: (input: {
    issuer: string;
    action: TotpOperation;
    nonceHash: string | null;
  }) => Promise<string>;
  verify: (token: string) => Promise<T>;
  complete: (input: {
    operationId: string;
    credential: T;
    verifiedAt: number;
  }) => Promise<void>;
  status: (input: { operationId: string; credential: T }) => Promise<boolean>;
  fetcher?: typeof fetch;
}): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  let inFlight = 0;
  const allowAttempt = createProxyRateLimit({
    maximum: 60,
    windowMs: 60_000,
    maxPeers: 2048,
  });
  return async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const target = clerkProxyUrl(options.issuer, request.url ?? "");
    if (!target) {
      response.writeHead(400).end();
      return;
    }
    if (
      !["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"].includes(
        request.method ?? "",
      )
    ) {
      response.writeHead(405).end();
      return;
    }
    if (inFlight >= MAX_IN_FLIGHT) {
      response.writeHead(503).end();
      return;
    }
    inFlight++;
    const readTimer = setTimeout(() => request.destroy(), options.timeoutMs);
    readTimer.unref();
    try {
      const body = await readRequest(request);
      clearTimeout(readTimer);
      const requestedAction = totpOperation(request.method, request.url ?? "");
      if (
        requestedAction &&
        !allowAttempt(request.socket.remoteAddress ?? "unknown", Date.now())
      ) {
        response.writeHead(429).end();
        return;
      }
      const action =
        requestedAction &&
        eligibleTotpOperation(
          requestedAction,
          request.headers["content-type"],
          body,
        )
          ? requestedAction
          : null;
      const enrollmentSession =
        action === "enrollment"
          ? enrollmentSessionSelector(request.url ?? "")
          : null;
      if (action === "enrollment" && !enrollmentSession) {
        response.writeHead(400).end();
        return;
      }
      const marker =
        action === "enrollment"
          ? `JointMFA2.${randomBytes(32).toString("base64url")}`
          : undefined;
      let operationId: string | null = null;
      if (action) {
        try {
          operationId = await options.begin({
            issuer: options.issuer,
            action,
            nonceHash: marker
              ? createHash("sha256").update(marker).digest("hex")
              : null,
          });
        } catch {
          response.writeHead(503).end();
          return;
        }
      }
      const headers = clerkProxyHeaders(
        request.headers,
        options.secret,
        request.socket.remoteAddress ?? "",
        operationId ? marker : undefined,
      );
      headers.set("clerk-proxy-url", options.proxyUrl);
      const method = request.method ?? "GET";
      const upstream = await (options.fetcher ?? fetch)(target, {
        method,
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs),
        ...(["GET", "HEAD"].includes(method)
          ? {}
          : { body: new Uint8Array(body) }),
      });
      if (upstream.status >= 300 && upstream.status < 400)
        throw new Error("Provider redirect rejected");
      const verifiedAt = Date.now();
      const bytes = await readResponse(upstream);
      if (action && operationId && upstream.ok) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(bytes.toString("utf8"));
        } catch {
          parsed = null;
        }
        const candidate = providerTotpCandidate(action, parsed);
        if (
          candidate &&
          (action !== "enrollment" || candidate.sessionId === enrollmentSession)
        )
          await captureProxyTotp({
            action,
            candidate,
            operationId,
            verifiedAt,
            verify: options.verify,
            complete: options.complete,
            status: options.status,
          });
      }
      for (const name of [
        "content-type",
        "authorization",
        "retry-after",
        "x-ratelimit-limit",
        "x-ratelimit-remaining",
        "x-ratelimit-reset",
      ]) {
        const value = upstream.headers.get(name);
        if (value !== null) response.setHeader(name, value);
      }
      response.writeHead(upstream.status).end(bytes);
    } catch {
      if (!response.headersSent) response.writeHead(502).end();
      else response.destroy();
    } finally {
      clearTimeout(readTimer);
      inFlight--;
    }
  };
}
