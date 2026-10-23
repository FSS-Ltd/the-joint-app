import type { ClerkPrivacyIdentity } from "@joint/database/privacy-journal";
import type { DeletionProvider } from "./deletion-provider.js";

interface Configuration {
  CLERK_SECRET_KEY: string;
  CLERK_ISSUER: string;
  CLERK_TIMEOUT_MS: number;
}
/** Deletes only external identities recorded in the verified, independent journal. */
export class ClerkAuthAdmin implements DeletionProvider {
  readonly supportsClerk = true;
  constructor(
    private readonly environment: Configuration,
    private readonly legacy?: DeletionProvider,
  ) {}

  async deleteUser(
    userId: string,
    signal?: AbortSignal,
    identities?: readonly ClerkPrivacyIdentity[],
  ): Promise<boolean> {
    if (!identities?.length)
      return this.legacy?.deleteUser(userId, signal) ?? false;
    if (
      identities.length > 5 ||
      identities.some(
        (identity) =>
          identity.provider !== "clerk" ||
          identity.issuer !== this.environment.CLERK_ISSUER ||
          !/^user_[A-Za-z0-9]{1,123}$/.test(identity.subject),
      )
    )
      return false;
    const timeout = AbortSignal.timeout(this.environment.CLERK_TIMEOUT_MS);
    const bounded = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      for (const identity of identities) {
        const response = await this.request(
          identity.subject,
          "DELETE",
          bounded,
        );
        if (response.status === 404) {
          if (!resourceNotFound(response.value)) return false;
          const confirmed = await this.request(
            identity.subject,
            "GET",
            bounded,
          );
          if (confirmed.status !== 404 || !resourceNotFound(confirmed.value))
            return false;
        } else if (
          response.status !== 200 ||
          !deletedUser(response.value, identity.subject)
        )
          return false;
      }
      return this.legacy ? this.legacy.deleteUser(userId, signal) : true;
    } catch {
      return false;
    }
  }

  private async request(
    subject: string,
    method: "GET" | "DELETE",
    signal: AbortSignal,
  ): Promise<{ status: number; value: unknown }> {
    const response = await fetch(`https://api.clerk.com/v1/users/${subject}`, {
      method,
      redirect: "error",
      cache: "no-store",
      signal,
      headers: {
        Authorization: `Bearer ${this.environment.CLERK_SECRET_KEY}`,
        Accept: "application/json",
      },
    });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Provider reconciliation pending");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 4096) throw new Error("Provider reconciliation pending");
        chunks.push(next.value);
      }
      const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      return { status: response.status, value };
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  }
}
function deletedUser(value: unknown, subject: string): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    "object" in value &&
    value.object === "user" &&
    "id" in value &&
    value.id === subject &&
    "deleted" in value &&
    value.deleted === true
  );
}
function resourceNotFound(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    "errors" in value &&
    Array.isArray(value.errors) &&
    value.errors.length === 1 &&
    value.errors.every(
      (error: unknown) =>
        !!error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "resource_not_found",
    )
  );
}
