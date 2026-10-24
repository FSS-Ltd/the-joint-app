/** Only expected access denials become uniform unavailable-object responses. */
export function isAuthorityUnavailable(error: unknown): boolean {
  if (
    error instanceof Error &&
    [
      "Authorization scope is no longer valid",
      "Archive session is no longer valid",
    ].includes(error.message)
  )
    return true;
  if (typeof error !== "object" || error === null || !("meta" in error))
    return false;
  const meta = error.meta;
  if (
    typeof meta !== "object" ||
    meta === null ||
    !("driverAdapterError" in meta)
  )
    return false;
  const adapter = meta.driverAdapterError;
  if (typeof adapter !== "object" || adapter === null || !("cause" in adapter))
    return false;
  const cause = adapter.cause;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "originalCode" in cause &&
    cause.originalCode === "42501"
  );
}
