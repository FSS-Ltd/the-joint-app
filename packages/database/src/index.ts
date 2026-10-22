import pg from "pg";
export interface DatabaseConnection {
  ready(): Promise<boolean>;
  close(): Promise<void>;
}
export function createDatabase(
  connectionString: string,
  timeoutMs: number,
): DatabaseConnection {
  const pool = new pg.Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
    statement_timeout: timeoutMs,
  });
  // Idle connection failures must not crash services or expose connection details.
  pool.on("error", () => {});
  return {
    async ready(): Promise<boolean> {
      try {
        await pool.query("SELECT 1");
        return true;
      } catch {
        return false;
      }
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}
