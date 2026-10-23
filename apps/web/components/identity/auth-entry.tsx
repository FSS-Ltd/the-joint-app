import type { ReactNode } from "react";
import { authUiConfiguration } from "../../lib/server/auth-ui";
import { AuthForm } from "./auth-form";
import type { AuthMode } from "./auth-content";
import { ClerkAuthForm } from "./clerk/auth-form";
import { ClerkAvailability, AuthUnavailable } from "./clerk/availability";

export function AuthEntry({ mode }: { mode: AuthMode }): ReactNode {
  const configuration = authUiConfiguration(process.env);
  if (configuration.provider === "local") return <AuthForm mode={mode} />;
  if (configuration.provider === "unavailable") return <AuthUnavailable />;
  return (
    <ClerkAvailability>
      <ClerkAuthForm mode={mode} />
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
