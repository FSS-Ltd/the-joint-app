interface LondonClock {
  today: string;
  now: Date;
  nextMidnightAt: Date;
  nextMonthAt: Date;
}
interface ClockDatabase {
  $queryRaw(query: TemplateStringsArray): Promise<LondonClock[]>;
}

/** One database instant supplies the local date and both calendar deadlines. */
export async function readLondonClock(
  database: ClockDatabase,
): Promise<LondonClock> {
  const [clock] = await database.$queryRaw`
    SELECT (statement_timestamp() AT TIME ZONE 'Europe/London')::date::text AS today,
      statement_timestamp() AS now,
      (((statement_timestamp() AT TIME ZONE 'Europe/London')::date + 1)::timestamp
        AT TIME ZONE 'Europe/London') AS "nextMidnightAt",
      ((date_trunc('month', statement_timestamp() AT TIME ZONE 'Europe/London') + interval '1 month')
        AT TIME ZONE 'Europe/London') AS "nextMonthAt"`;
  if (!clock) throw Error("London evaluation clock unavailable");
  return clock;
}
