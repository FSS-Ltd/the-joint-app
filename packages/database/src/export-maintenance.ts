import type { PrismaClient } from "./client.js";

/** Remove expired encrypted objects in bounded batches; safe for the runtime role. */
export async function maintainExports(database: PrismaClient): Promise<number> {
  const [result] = await database.$queryRaw<
    { removed: number }[]
  >`SELECT app.expire_export_objects() AS removed`;
  return result?.removed ?? 0;
}
