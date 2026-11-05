import type { ReactNode } from "react";
import type { MeResponse } from "@joint/contracts";
import { IdentityEntry } from "./identity-entry";
import { WelcomeScreen } from "@/features/welcome/welcome-screen";
import { publicConfiguration } from "./public-configuration";
export function ConfiguredEntry({
  ready,
}: { ready?: (me: MeResponse) => ReactNode } = {}): React.JSX.Element {
  return publicConfiguration.kind === "configured" ? (
    <IdentityEntry ready={ready} />
  ) : (
    <WelcomeScreen />
  );
}
