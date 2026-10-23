import {
  idempotencyKeySchema,
  privacyWorkerEnvironmentSchema,
  readEnvironment,
} from "@joint/contracts";

/** Local development only. Provider administrative credentials never enter API options. */
export class LocalAuthAdmin {
  private readonly url: string;
  private readonly key: string;

  constructor(url: string, key: string) {
    const value = readEnvironment(privacyWorkerEnvironmentSchema, {
      PRIVACY_AUTH_URL: url,
      PRIVACY_AUTH_ADMIN_KEY: key,
    });
    this.url = value.PRIVACY_AUTH_URL.replace(/\/$/, "");
    this.key = value.PRIVACY_AUTH_ADMIN_KEY;
  }

  async deleteUser(userId: string, signal?: AbortSignal): Promise<boolean> {
    if (!idempotencyKeySchema.safeParse(userId).success) return false;
    try {
      const response = await fetch(`${this.url}/admin/users/${userId}`, {
        method: "DELETE",
        redirect: "error",
        headers: { apikey: this.key, Authorization: `Bearer ${this.key}` },
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(2000)])
          : AbortSignal.timeout(2000),
      });
      if (response.status === 404) return await confirmedAbsent(response);
      await response.body?.cancel();
      return response.ok;
    } catch {
      return false;
    }
  }
}

async function confirmedAbsent(response: Response): Promise<boolean> {
  const reader = response.body?.getReader();
  if (!reader) return false;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 4096) return false;
      chunks.push(next.value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return (
      typeof value === "object" &&
      value !== null &&
      "error_code" in value &&
      value.error_code === "user_not_found"
    );
  } catch {
    return false;
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
