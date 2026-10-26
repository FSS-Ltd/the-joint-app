export type AuthDestination =
  | "/join"
  | "/accounts"
  | "/household"
  | "/archive"
  | "/settings/privacy"
  | "/dashboard";
export type AuthTransition =
  | "/sign-in"
  | "/sign-up"
  | "/recovery"
  | "/security"
  | "/auth/complete"
  | "/auth/callback"
  | "/auth/task/password";

export function readAuthDestination(search: string): AuthDestination {
  const next = new URLSearchParams(search).get("next");
  return next === "dashboard"
    ? "/dashboard"
    : next === "archive"
      ? "/archive"
      : next === "privacy"
        ? "/settings/privacy"
        : next === "join"
          ? "/join"
          : next === "accounts"
            ? "/accounts"
            : "/household";
}
/** Carry only the existing destination allowlist, never provider codes or arbitrary redirects. */
export function authContinuation(path: AuthTransition, search: string): string {
  const destination = readAuthDestination(search);
  if (destination === "/household") return path;
  const next =
    destination === "/settings/privacy" ? "privacy" : destination.slice(1);
  return `${path}?next=${next}`;
}
