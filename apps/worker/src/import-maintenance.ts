import type { PrismaClient } from "@joint/database/client";

/** The database function only clears expired originals and reconciles terminal jobs. */
export async function maintainImports(database: PrismaClient): Promise<void> {
  await database.$queryRaw`SELECT app.expire_import_objects(100)`;
  await database.$queryRaw`SELECT app.reconcile_import_failures(100)`;
}
