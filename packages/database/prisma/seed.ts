import { createOrm } from "../src/client.js";
import { databaseEnvironmentSchema, readEnvironment } from "@joint/contracts";

const env = readEnvironment(databaseEnvironmentSchema, process.env);
const database = createOrm(env.DATABASE_URL);
try {
  for (const id of [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
  ]) {
    await database.household.upsert({
      where: { id },
      create: { id },
      update: {},
    });
  }
} finally {
  await database.$disconnect();
}
