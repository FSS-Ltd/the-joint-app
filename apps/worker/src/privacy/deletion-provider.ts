import type { ClerkPrivacyIdentity } from "@joint/database/privacy-journal";

export interface DeletionProvider {
  readonly supportsClerk?: boolean;
  deleteUser(
    userId: string,
    signal?: AbortSignal,
    identities?: readonly ClerkPrivacyIdentity[],
  ): Promise<boolean>;
}
