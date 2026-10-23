import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export function createOrm(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: 2,
      connectionTimeoutMillis: 2000,
      statement_timeout: 5000,
    }),
    log: [],
  });
}
export type { PrismaClient, Prisma } from "./generated/prisma/client.js";
