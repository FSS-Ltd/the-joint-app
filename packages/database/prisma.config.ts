import { defineConfig } from "prisma/config";
import {
  migrationEnvironmentSchema,
  databaseEnvironmentSchema,
  readEnvironment,
} from "@joint/contracts";
const migration = readEnvironment(migrationEnvironmentSchema, process.env);
const database = readEnvironment(databaseEnvironmentSchema, {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://joint:local-development-only@127.0.0.1:5432/joint",
});
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --import tsx prisma/seed.ts",
  },
  datasource: {
    url: migration.MIGRATION_DATABASE_URL ?? database.DATABASE_URL,
  },
});
