import "reflect-metadata";
import {
  apiEnvironmentSchema,
  authServerEnvironmentSchema,
  identityEnvironmentSchema,
  readEnvironment,
} from "@joint/contracts";
import { createOrm } from "@joint/database/client";
import { createDatabase } from "@joint/database";
import { createApplication } from "./application.js";
async function main(): Promise<void> {
  const env = readEnvironment(apiEnvironmentSchema, process.env);
  const identity = readEnvironment(identityEnvironmentSchema, process.env);
  const auth = [
    "SUPABASE_AUTH_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "AUTH_TOKEN_KEY",
    "AUTH_EMAIL_HASH_KEY",
  ].some((key) => process.env[key] !== undefined)
    ? readEnvironment(authServerEnvironmentSchema, process.env)
    : undefined;
  const orm =
    identity.AUTH_ISSUER || auth ? createOrm(env.DATABASE_URL) : undefined;
  const database = createDatabase(env.DATABASE_URL, env.DATABASE_TIMEOUT_MS);
  const app = await createApplication(
    database,
    orm && identity.AUTH_ISSUER
      ? { database: orm, issuer: identity.AUTH_ISSUER }
      : undefined,
    orm && auth ? { database: orm, environment: auth } : undefined,
  );
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  // Nest closes the listener before releasing its database pool.
  await app.listen(env.API_PORT, "127.0.0.1");
  const close = async (): Promise<void> => {
    await app.close();
    await database.close();
    await orm?.$disconnect();
  };
  process.once("SIGINT", () => {
    void close();
  });
  process.once("SIGTERM", () => {
    void close();
  });
}
main().catch((error) => {
  process.stderr.write(
    error instanceof Error &&
      error.message.startsWith("Invalid environment fields:")
      ? `${error.message}\n`
      : "API startup failed\n",
  );
  process.exitCode = 1;
});
