type ProviderSession = { id: string; user?: { id: string } | null };
export function sessionActor(
  session: ProviderSession | null | undefined,
): string | null {
  return session ? `${session.user?.id}:${session.id}` : null;
}
/** The captured resource fixes the remote target before any SDK await. */
export async function removeOriginalSession(
  original: ProviderSession & { remove(): Promise<unknown> },
): Promise<void> {
  await original.remove();
}
