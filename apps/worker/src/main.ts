import { workerEnvironmentSchema, readEnvironment } from "@joint/contracts";
import { createDatabase } from "@joint/database";
async function main(): Promise<void> {
  const env = readEnvironment(workerEnvironmentSchema, process.env);
  const database = createDatabase(env.DATABASE_URL, env.DATABASE_TIMEOUT_MS);
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = async (): Promise<void> => {
    const ready = await database.ready();
    process.stdout.write(
      `Worker database ${ready ? "ready" : "unavailable"}\n`,
    );
    if (!stopping)
      timer = setTimeout(() => {
        void check();
      }, env.WORKER_INTERVAL_MS);
  };
  const close = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    clearTimeout(timer);
    await database.close();
  };
  process.once("SIGINT", () => {
    void close();
  });
  process.once("SIGTERM", () => {
    void close();
  });
  await check();
}
main().catch((error) => {
  process.stderr.write(
    error instanceof Error &&
      error.message.startsWith("Invalid environment fields:")
      ? `${error.message}\n`
      : "Worker startup failed\n",
  );
  process.exitCode = 1;
});
