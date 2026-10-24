import "reflect-metadata";
import {
  apiEnvironmentSchema,
  clerkIdentityEnvironmentSchema,
  clerkWebhookEndpointEnvironmentSchema,
  readAuthProvider,
  authServerEnvironmentSchema,
  identityEnvironmentSchema,
  importEnvironmentSchema,
  privacyEnvironmentSchema,
  readEnvironment,
} from "@joint/contracts";
import { createOrm } from "@joint/database/client";
import { createDatabase } from "@joint/database";
import { createDatabaseNotifications } from "@joint/database/notifications";
import { StatusEventHub } from "./modules/events/status-hub.js";
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
  const legacyEnvironment =
    clerk && process.env.SUPABASE_AUTH_URL !== undefined
      ? readEnvironment(authServerEnvironmentSchema, process.env)
      : undefined;
  const webhook =
    clerk &&
    (process.env.CLERK_WEBHOOK_SIGNING_SECRET !== undefined ||
      process.env.CLERK_WEBHOOK_INSTANCE_ID !== undefined)
      ? readEnvironment(clerkWebhookEndpointEnvironmentSchema, process.env)
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
          legacyEnvironment,
          clerkWebhook: webhook
            ? {
                signingSecret: webhook.CLERK_WEBHOOK_SIGNING_SECRET,
                instanceId: webhook.CLERK_WEBHOOK_INSTANCE_ID,
              }
            : undefined,
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
  if (options)
    options.events = new StatusEventHub((callbacks) =>
      createDatabaseNotifications({
        topic: "status",
        connectionString: env.DATABASE_URL,
        timeoutMs: env.DATABASE_TIMEOUT_MS,
        retryMaxMs: 30000,
        ...callbacks,
      }),
    );
  let app: Awaited<ReturnType<typeof createApplication>> | undefined;
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= (async () => {
      // End event streams before waiting for the HTTP listener to close.
      const stopped = await Promise.allSettled([
        options?.events?.close(),
        app?.close(),
      ]);
      // Nest closes the listener before releasing its database pool.
      const released = await Promise.allSettled([
        database.close(),
        orm?.$disconnect(),
      ]);
      if (
        [...stopped, ...released].some((result) => result.status === "rejected")
      )
        throw new Error("API shutdown failed");
    })();
    return closing;
  };
  try {
    app = await createApplication(
      database,
      orm && identity.AUTH_ISSUER
        ? { database: orm, issuer: identity.AUTH_ISSUER }
        : undefined,
      options,
    );
    app.getHttpAdapter().getInstance().disable("x-powered-by");
    await app.listen(env.API_PORT, "127.0.0.1");
  } catch (error) {
    await close().catch(() => {
      process.stderr.write("API cleanup failed\n");
    });
    throw error;
  }
  const stop = (): void => {
    void close().catch(() => {
      process.stderr.write("API shutdown failed\n");
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", () => {
    stop();
  });
  process.once("SIGTERM", () => {
    stop();
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
