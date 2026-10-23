import { randomBytes } from "node:crypto";
import { writeFile, access } from "node:fs/promises";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import process from "node:process";

async function settingsExist() {
  try {
    await access(".env.auth");
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return false;
    throw error;
  }
}
if (await settingsExist()) {
  process.stdout.write("Existing local auth settings preserved.\n");
} else {
  const authPort = Number(process.env.AUTH_HTTP_PORT ?? 15421);
  if (!Number.isInteger(authPort) || authPort < 1024 || authPort > 65535)
    throw new Error("Invalid environment fields: AUTH_HTTP_PORT");
  const issuer = `http://127.0.0.1:${authPort}/auth/v1`;
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  const kid = randomBytes(16).toString("hex");
  const key = {
    ...(await exportJWK(privateKey)),
    kid,
    alg: "ES256",
    use: "sig",
    key_ops: ["sign"],
  };
  const token = (role) =>
    new SignJWT({ role })
      .setProtectedHeader({ alg: "ES256", kid })
      .setIssuer(issuer)
      .setAudience("authenticated")
      .setIssuedAt()
      .setExpirationTime("365d")
      .sign(privateKey);
  const settings =
    [
      `AUTH_JWT_KEYS='${JSON.stringify([key])}'`,
      `AUTH_LOCAL_JWT_SECRET=${randomBytes(48).toString("base64url")}`,
      `AUTH_TOKEN_KEY=${randomBytes(32).toString("base64")}`,
      `AUTH_EMAIL_HASH_KEY=${randomBytes(32).toString("base64")}`,
      `SUPABASE_PUBLISHABLE_KEY=${await token("anon")}`,
      `SUPABASE_TEST_ADMIN_KEY=${await token("service_role")}`,
      `AUTH_HTTP_PORT=${authPort}`,
      `SUPABASE_AUTH_URL=${issuer}`,
      `AUTH_ISSUER=${issuer}`,
      "WEB_ORIGIN=http://127.0.0.1:3000",
    ].join("\n") + "\n";
  await writeFile(".env.auth", settings, { mode: 0o600, flag: "wx" });
  process.stdout.write(
    "Local auth settings created in ignored .env.auth. No credentials printed.\n",
  );
}
