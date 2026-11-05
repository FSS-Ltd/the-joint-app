export interface WealthClock {
  today: string;
  now: Date;
  nextChangeAt: Date;
}
interface ClockDatabase {
  $queryRaw(query: TemplateStringsArray): Promise<WealthClock[]>;
}

/** One database statement supplies every date/deadline for a wealth evaluation. */
export async function readWealthClock(
  database: ClockDatabase,
): Promise<WealthClock> {
  const [clock] = await database.$queryRaw`
    SELECT (statement_timestamp() AT TIME ZONE 'Europe/London')::date::text AS today,
      statement_timestamp() AS now,
      (((statement_timestamp() AT TIME ZONE 'Europe/London')::date + 1)::timestamp
        AT TIME ZONE 'Europe/London') AS "nextChangeAt"`;
  if (!clock) throw Error("Wealth evaluation clock unavailable");
  return clock;
}
