type ProviderSession = { id: string; user?: { id: string } | null };
export function sessionActor(
  session: ProviderSession | null | undefined,
): string | null {
  return session ? `${session.user?.id}:${session.id}` : null;
}
/** Clerk's single-session signOut fallback ignores a stale target ID. Fence before invoking it. */
export async function removeOriginalSession(
  original: ProviderSession,
  current: () => ProviderSession | null | undefined,
  exists: (id: string) => boolean,
  unchanged: () => boolean,
  signOut: (id: string) => Promise<void>,
): Promise<boolean> {
  if (
    !unchanged() ||
    sessionActor(current()) !== sessionActor(original) ||
    !exists(original.id)
  )
    return false;
  await signOut(original.id);
  return true;
}
