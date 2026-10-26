import { randomBytes, randomUUID } from "node:crypto";
import type { AuthContext } from "../../packages/contracts/dist/index.js";
import type { PrismaClient } from "../../packages/database/dist/client.js";
import { DeletionRepository } from "../../packages/database/dist/deletion.repository.js";

export async function purgeFixtureUser(
  database: PrismaClient,
  actor: AuthContext,
): Promise<void> {
  const deletion = new DeletionRepository(database);
  const request = await deletion.request(
    actor,
    randomUUID(),
    randomBytes(32).toString("hex"),
    new Date(Date.now() + 600000),
  );
  const lease = await deletion.claim(request.id);
  if (!lease) throw new Error("Missing synthetic contribution deletion lease");
  await deletion.purge(lease.id, lease.leaseToken);
  await deletion.purge(lease.id, lease.leaseToken);
  await deletion.finish(lease.id, lease.leaseToken, true);
}
