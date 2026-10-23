import { cookies } from "next/headers";
import { LOGOUT_CLEANUP_COOKIE } from "../../lib/server/browser-security";
import type { ReactNode } from "react";
import { authUiConfiguration } from "../../lib/server/auth-ui";
import { AuthForm } from "./auth-form";
import type { AuthMode } from "./auth-content";
import { ClerkAuthForm } from "./clerk/auth-form";
import { ClerkAvailability, AuthUnavailable } from "./clerk/availability";

export async function AuthEntry({
  mode,
}: {
  mode: AuthMode;
}): Promise<ReactNode> {
  const configuration = authUiConfiguration(process.env);
  if (configuration.provider === "local") return <AuthForm mode={mode} />;
  if (configuration.provider === "unavailable") return <AuthUnavailable />;
  return (
    <ClerkAvailability>
      <ClerkAuthForm
        mode={mode}
        cleanupPending={(await cookies()).has(LOGOUT_CLEANUP_COOKIE)}
      />
    </ClerkAvailability>
  );
}
export function ClerkEntry({ children }: { children: ReactNode }): ReactNode {
  return authUiConfiguration(process.env).provider === "clerk" ? (
    <ClerkAvailability>{children}</ClerkAvailability>
  ) : (
    <AuthUnavailable />
  );
}
