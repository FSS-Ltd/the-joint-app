import { IdentityEntry } from "./identity-entry";
import { WelcomeScreen } from "@/features/welcome/welcome-screen";
import { publicConfiguration } from "./public-configuration";
export function ConfiguredEntry(): React.JSX.Element {
  return publicConfiguration.kind === "configured" ? (
    <IdentityEntry />
  ) : (
    <WelcomeScreen />
  );
}
