import type { ClerkServerEnvironment } from "@joint/contracts";
export class ClerkProviderUnavailable extends Error {}
export class ClerkProviderNotFound extends Error {}
export class ClerkProviderRejected extends Error {}
export function createClerkRequest(environment: ClerkServerEnvironment) {
  return async function request(
    path: string,
    method: "GET" | "POST" | "DELETE",
    signal: AbortSignal,
    body?: object,
  ): Promise<unknown> {
    const response = await fetch(`https://api.clerk.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${environment.CLERK_SECRET_KEY}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      signal,
      redirect: "error",
      cache: "no-store",
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 404) throw new ClerkProviderNotFound();
      if (response.status === 422 || response.status === 429)
        throw new ClerkProviderRejected();
      throw new ClerkProviderUnavailable();
    }
    const reader = response.body?.getReader();
    if (!reader) throw new ClerkProviderUnavailable();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 65536) throw new ClerkProviderUnavailable();
        chunks.push(next.value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  };
}
