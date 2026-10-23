import type { ReactNode } from "react";
import { authUiConfiguration } from "../../lib/server/auth-ui";
import { Security } from "./security";
import { ClerkEntry } from "./auth-entry";
import { ClerkSecurity } from "./clerk/security";

export function SecurityEntry(): ReactNode {
  return authUiConfiguration(process.env).provider === "local" ? (
    <Security />
  ) : (
    <ClerkEntry>
      <ClerkSecurity />
    </ClerkEntry>
  );
}
