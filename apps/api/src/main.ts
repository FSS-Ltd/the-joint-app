import "reflect-metadata";
import { apiEnvironmentSchema, readEnvironment } from "@joint/contracts";
import { createDatabase } from "@joint/database";
import { createApplication } from "./application.js";
async function main(): Promise<void> {
  const env = readEnvironment(apiEnvironmentSchema, process.env);
  const database = createDatabase(env.DATABASE_URL, env.DATABASE_TIMEOUT_MS);
  const app = await createApplication(database);
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  // Nest closes the listener before releasing its database pool.
  await app.listen(env.API_PORT, "127.0.0.1");
  const close = async (): Promise<void> => {
    await app.close();
    await database.close();
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
