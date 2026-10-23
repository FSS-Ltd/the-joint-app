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

/** A synthetic proof must not be in the future for either the app or database clock. */
export async function fixtureTimestamp(
  database: ReturnType<typeof createOrm>,
): Promise<number> {
  const sentAt = Date.now();
  const [row] = await database.$queryRaw<
    { now: Date }[]
  >`SELECT clock_timestamp() AS now`;
  if (!row || !Number.isSafeInteger(row.now.getTime()))
    throw new Error("Fixture clock unavailable");
  return Math.min(sentAt, row.now.getTime());
}
