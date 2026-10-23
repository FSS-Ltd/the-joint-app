import { createOrm } from "../../packages/database/dist/client.js";

// Test cleanup needs maintenance privileges; product code always uses DATABASE_URL.
export function createFixtureOwner(): ReturnType<typeof createOrm> {
  const connection = process.env.MIGRATION_DATABASE_URL;
  if (
    !connection ||
    !/^(127\.0\.0\.1|localhost)$/.test(new URL(connection).hostname)
  )
    throw new Error(
      "Fixture cleanup requires local migration database configuration",
    );
  return createOrm(connection);
}
