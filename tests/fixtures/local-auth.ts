import { createHmac, randomUUID } from "node:crypto";
import { AuthProvider } from "../../apps/api/src/modules/identity/auth-provider.js";

interface MailIndex {
  messages: { ID: string; To: { Address: string }[] }[];
}

export async function emailCode(
  email: string,
  previousIds: Set<string>,
): Promise<string> {
  const port = Number(process.env.MAILPIT_HTTP_PORT ?? 15424);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid environment fields: MAILPIT_HTTP_PORT");
  const inbox = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await fetch(`${inbox}/api/v1/messages`, {
      signal: AbortSignal.timeout(2000),
    });
    const index = (await response.json()) as MailIndex;
    const message = index.messages.find(
      (entry) =>
        !previousIds.has(entry.ID) &&
        entry.To.some(({ Address }) => Address === email),
    );
    if (message) {
      previousIds.add(message.ID);
      const detail = (await (
        await fetch(`${inbox}/api/v1/message/${encodeURIComponent(message.ID)}`)
      ).json()) as { Text: string };
      const code = detail.Text.match(/\b\d{6}\b/)?.[0];
      if (code) return code;
      throw new Error("Synthetic confirmation message did not contain a code");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Synthetic confirmation mail did not arrive");
}

export function totp(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.replace(/=+$/, "").toUpperCase()]
    .map((character) =>
      alphabet.indexOf(character).toString(2).padStart(5, "0"),
    )
    .join("");
  const bytes = bits.match(/.{8}/g) ?? [];
  const key = Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}

export interface LocalAuthUser {
  email: string;
  password: string;
  session: Awaited<ReturnType<AuthProvider["login"]>>;
}

export function createLocalAuthFixture(): {
  provider: AuthProvider;
  createConfirmedUser(): Promise<LocalAuthUser>;
  deleteUser(userId: string): Promise<void>;
} {
  const authUrl = process.env.SUPABASE_AUTH_URL;
  const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const adminKey = process.env.SUPABASE_TEST_ADMIN_KEY;
  if (!authUrl || !apiKey || !adminKey)
    throw new Error("Local Auth integration requires .env.auth configuration");
  if (!new URL(authUrl).hostname.match(/^(127\.0\.0\.1|localhost)$/))
    throw new Error("Auth fixtures require a loopback provider");
  const provider = new AuthProvider(authUrl, apiKey);
  const headers = {
    apikey: adminKey,
    Authorization: `Bearer ${adminKey}`,
    "Content-Type": "application/json",
  };
  return {
    provider,
    async createConfirmedUser(): Promise<LocalAuthUser> {
      const email = `fixture-${randomUUID()}@example.test`;
      const password = `Synthetic-${randomUUID()}-9a!`;
      const response = await fetch(`${authUrl}/admin/users`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      if (!response.ok) throw new Error("Synthetic user creation failed");
      return {
        email,
        password,
        session: await provider.login(email, password),
      };
    },
    async deleteUser(userId: string): Promise<void> {
      const response = await fetch(
        `${authUrl}/admin/users/${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
          headers,
        },
      );
      if (!response.ok) throw new Error("Synthetic user deletion failed");
    },
  };
}
