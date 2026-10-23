import process from "node:process";
import { Buffer } from "node:buffer";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import {
  readSettings,
  privateFile,
  ensurePrivacyJournal,
} from "./clerk-files.mjs";
import { createPublicKey, randomBytes } from "node:crypto";
import {
  clerkIdentityEnvironmentSchema,
  clerkWebEnvironmentSchema,
  readEnvironment,
} from "../packages/contracts/dist/index.js";

async function publicKeys(response) {
  if (!response.ok || !response.body)
    throw new Error("Development public signing key unavailable");
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 65536)
        throw new Error("Development public signing key unavailable");
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
async function setup() {
  const base = await readSettings(".env"),
    legacy = await readSettings(".env.auth"),
    saved = await readSettings(".env.clerk");
  if (saved.AUTH_PROVIDER !== undefined && saved.AUTH_PROVIDER !== "clerk")
    throw new Error("Review existing provider selection before changing it");
  const values = { ...base, ...legacy, ...saved, ...process.env };
  const publishable = values.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (
    !publishable?.startsWith("pk_test_") ||
    !/^sk_test_[A-Za-z0-9_-]{16,4096}$/.test(values.CLERK_SECRET_KEY ?? "")
  )
    throw new Error(
      "Set development CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in ignored .env",
    );
  const host = Buffer.from(publishable.slice(8), "base64").toString("utf8");
  if (!/^[a-z0-9-]+\.clerk\.accounts\.dev\$$/.test(host))
    throw new Error(
      "Publishable key must identify a Clerk Development instance",
    );
  const issuer = `https://${host.slice(0, -1)}`;
  let publicKey = saved.CLERK_JWT_KEY;
  if (!publicKey) {
    const response = await globalThis.fetch(`${issuer}/.well-known/jwks.json`, {
      redirect: "error",
      signal: globalThis.AbortSignal.timeout(3000),
    });
    const jwks = await publicKeys(response);
    const keys = Array.isArray(jwks.keys)
      ? jwks.keys.filter(
          (key) =>
            key.kty === "RSA" && (!key.use || key.use === "sig") && !key.d,
        )
      : [];
    if (keys.length !== 1)
      throw new Error(
        "Select the active Clerk RSA public key manually; do not guess during rotation",
      );
    publicKey = createPublicKey({ key: keys[0], format: "jwk" })
      .export({ type: "spki", format: "pem" })
      .toString();
  }
  if (saved.CLERK_ISSUER && saved.CLERK_ISSUER !== issuer)
    throw new Error(
      "Existing Clerk issuer differs; preserve its identity mappings and review the change",
    );
  const settings = {
    ...saved,
    AUTH_PROVIDER: "clerk",
    CLERK_ISSUER: issuer,
    CLERK_JWT_KEY: publicKey,
    CLERK_AUTHORIZED_PARTIES:
      saved.CLERK_AUTHORIZED_PARTIES ??
      "http://127.0.0.1:3000,http://localhost:3000",
    CLERK_TIMEOUT_MS: saved.CLERK_TIMEOUT_MS ?? "2000",
    AUTH_TOKEN_KEY: values.AUTH_TOKEN_KEY ?? randomBytes(32).toString("base64"),
    AUTH_EMAIL_HASH_KEY:
      values.AUTH_EMAIL_HASH_KEY ?? randomBytes(32).toString("base64"),
  };
  const candidate = { ...values, ...settings };
  readEnvironment(clerkIdentityEnvironmentSchema, candidate);
  readEnvironment(clerkWebEnvironmentSchema, candidate);
  const key = createPublicKey(publicKey);
  if (
    key.asymmetricKeyType !== "rsa" ||
    key.asymmetricKeyDetails.modulusLength < 2048
  )
    throw new Error("Clerk public key must be RSA with at least 2048 bits");
  for (const name of ["AUTH_TOKEN_KEY", "AUTH_EMAIL_HASH_KEY"])
    if (
      (legacy[name] && legacy[name] !== settings[name]) ||
      (saved[name] && saved[name] !== settings[name])
    )
      throw new Error(
        `Preserve existing ${name} before linking legacy identities`,
      );
  const content =
    Object.entries(settings)
      .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
      .join("\n") + "\n";
  if (Object.keys(saved).length) {
    // Do not rewrite an existing secret file in place. Add only missing local keys.
    const additions = Object.entries(settings).filter(
      ([name]) => !(name in saved),
    );
    if (additions.length) {
      const file = await open(
        ".env.clerk",
        constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW,
      );
      try {
        const stat = await file.stat();
        if (
          !stat.isFile() ||
          stat.mode & 0o077 ||
          stat.uid !== process.getuid()
        )
          throw new Error("Existing Clerk settings must be private");
        await file.writeFile(
          "\n" +
            additions
              .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
              .join("\n") +
            "\n",
        );
        await file.sync();
      } finally {
        await file.close();
      }
    }
  } else await privateFile(".env.clerk", content);
  await ensurePrivacyJournal();
  process.stdout.write(
    "Clerk development settings validated. Existing keys and privacy journal preserved; no credentials printed. No deployment or webhook endpoint created.\n",
  );
}
setup().catch((error) => {
  process.stderr.write(
    error instanceof Error &&
      error.message.startsWith("Invalid environment fields:")
      ? `${error.message}\n`
      : "Clerk local setup failed. Check development keys, issuer/public-key pairing and private file permissions; preserve existing identity keys and privacy journal.\n",
  );
  process.exitCode = 1;
});
