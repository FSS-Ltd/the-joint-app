import "reflect-metadata";
import {
  apiEnvironmentSchema,
  clerkIdentityEnvironmentSchema,
  readAuthProvider,
  authServerEnvironmentSchema,
  identityEnvironmentSchema,
  importEnvironmentSchema,
  privacyEnvironmentSchema,
  readEnvironment,
} from "@joint/contracts";
import { createOrm } from "@joint/database/client";
import { createDatabase } from "@joint/database";
import type { AuthOptions } from "./modules/identity/identity.module.js";
import { createApplication } from "./application.js";
async function main(): Promise<void> {
  const env = readEnvironment(apiEnvironmentSchema, process.env);
  const mode = readAuthProvider(process.env);
  const identity =
    mode === "local"
      ? readEnvironment(identityEnvironmentSchema, process.env)
      : {};
  const auth =
    mode === "local" &&
    [
      "SUPABASE_AUTH_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "AUTH_TOKEN_KEY",
      "AUTH_EMAIL_HASH_KEY",
    ].some((key) => process.env[key] !== undefined)
      ? readEnvironment(authServerEnvironmentSchema, process.env)
      : undefined;
  const imports =
    process.env.IMPORT_DATA_KEY === undefined
      ? undefined
      : readEnvironment(importEnvironmentSchema, process.env);
  const privacy =
    process.env.PRIVACY_JOURNAL_PATH === undefined
      ? undefined
      : readEnvironment(privacyEnvironmentSchema, process.env);
  const clerk =
    mode === "clerk"
      ? readEnvironment(clerkIdentityEnvironmentSchema, process.env)
      : undefined;
  const orm =
    identity.AUTH_ISSUER || auth || clerk
      ? createOrm(env.DATABASE_URL)
      : undefined;
  const database = createDatabase(env.DATABASE_URL, env.DATABASE_TIMEOUT_MS);
  const options: AuthOptions | undefined =
    orm && clerk
      ? {
          provider: "clerk",
          database: orm,
          environment: clerk,
          importKey: imports?.IMPORT_DATA_KEY,
          privacyJournalPath: privacy?.PRIVACY_JOURNAL_PATH,
        }
      : orm && auth
        ? {
            database: orm,
            environment: auth,
            importKey: imports?.IMPORT_DATA_KEY,
            privacyJournalPath: privacy?.PRIVACY_JOURNAL_PATH,
          }
        : undefined;
  const app = await createApplication(
    database,
    orm && identity.AUTH_ISSUER
      ? { database: orm, issuer: identity.AUTH_ISSUER }
      : undefined,
    options,
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
