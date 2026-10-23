import type { DeletionRepository } from "@joint/database/deletion";
import type { DeletionProvider } from "./deletion-provider.js";
import type { ClerkPrivacyIdentity } from "@joint/database/privacy-journal";
import type { PrivacyJournal } from "@joint/database/privacy-journal";

/** One bounded global identity operation per local cycle, independently of household jobs. */
export async function processDeletion(
  repository: Pick<DeletionRepository, "claim" | "purge" | "finish">,
  provider: DeletionProvider,
  journal: PrivacyJournal,
  signal?: AbortSignal,
): Promise<"idle" | "completed" | "pending"> {
  if (signal?.aborted) return "idle";
  const lease = await repository.claim();
  if (!lease) return "idle";
  let verified = false;
  let identities: readonly ClerkPrivacyIdentity[] | undefined;
  for await (const entry of journal.entries())
    if (
      entry.kind === "DELETE_USER" &&
      entry.requestId === lease.id &&
      entry.userId === lease.userId
    ) {
      verified = true;
      if (entry.providerIdentities) identities = entry.providerIdentities;
    }
  if (!verified) throw new Error("Verified privacy intent unavailable");
  // Purge failures leave the lease to expire. Never advance provider/completion state.
  if (identities?.length && !provider.supportsClerk)
    throw new Error("Clerk reconciliation unavailable");
  await repository.purge(lease.id, lease.leaseToken);
  const removed = await provider.deleteUser(lease.userId, signal, identities);
  await repository.finish(lease.id, lease.leaseToken, removed);
  return removed ? "completed" : "pending";
}
