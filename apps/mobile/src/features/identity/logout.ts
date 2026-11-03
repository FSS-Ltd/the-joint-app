type LogoutResult = {
  state: string;
  providerCleanupPending?: boolean;
  providerCleanupToken?: string;
};
export async function logoutIdentity(
  scope: "local" | "global",
  operations: {
    logout(scope: "local" | "global"): Promise<LogoutResult>;
    revoke(): void;
    saveTicket(ticket: string | null): Promise<void>;
    signOut(): Promise<void>;
  },
): Promise<void> {
  const result = await operations.logout(scope);
  if (result.state !== "SIGNED_OUT")
    throw new Error("Sign-out could not be confirmed.");
  operations.revoke();
  // Revocation is durable before local cleanup. Keep the retry capability through SDK failures.
  if (result.providerCleanupPending && !result.providerCleanupToken)
    throw new Error("Sign-out cleanup could not be saved.");
  if (result.providerCleanupToken)
    await operations.saveTicket(result.providerCleanupToken);
  await operations.signOut();
}
export async function retryProviderCleanup(
  ticket: string,
  retry: (ticket: string) => Promise<LogoutResult>,
  saveTicket: (ticket: string | null) => Promise<void>,
): Promise<"complete" | "pending" | "expired"> {
  let result: LogoutResult;
  try {
    result = await retry(ticket);
  } catch (cause) {
    if (!isCredentialRejected(cause)) throw cause;
    await saveTicket(null);
    return "expired";
  }
  if (result.state !== "SIGNED_OUT")
    throw new Error("Sign-out could not be confirmed.");
  await saveTicket(
    result.providerCleanupPending
      ? (result.providerCleanupToken ?? ticket)
      : null,
  );
  return result.providerCleanupPending ? "pending" : "complete";
}

export function isCredentialRejected(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "status" in cause &&
    cause.status === 401
  );
}
