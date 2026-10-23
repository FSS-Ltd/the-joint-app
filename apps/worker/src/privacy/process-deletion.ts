import type { DeletionRepository } from "@joint/database/deletion";
import type { LocalAuthAdmin } from "./local-auth-admin.js";
import type { PrivacyJournal } from "@joint/database/privacy-journal";

/** One bounded global identity operation per local cycle, independently of household jobs. */
export async function processDeletion(
  repository: Pick<DeletionRepository, "claim" | "purge" | "finish">,
  provider: LocalAuthAdmin,
  journal: PrivacyJournal,
  signal?: AbortSignal,
): Promise<"idle" | "completed" | "pending"> {
  if (signal?.aborted) return "idle";
  const lease = await repository.claim();
  if (!lease) return "idle";
  let verified = false;
  for await (const entry of journal.entries())
    if (
      entry.kind === "DELETE_USER" &&
      entry.requestId === lease.id &&
      entry.userId === lease.userId
    )
      verified = true;
  if (!verified) throw new Error("Verified privacy intent unavailable");
  // Purge failures leave the lease to expire. Never advance provider/completion state.
  await repository.purge(lease.id, lease.leaseToken);
  const removed = await provider.deleteUser(lease.userId, signal);
  await repository.finish(lease.id, lease.leaseToken, removed);
  return removed ? "completed" : "pending";
}
