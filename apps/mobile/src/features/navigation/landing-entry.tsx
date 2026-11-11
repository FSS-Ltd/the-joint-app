import { Redirect } from "expo-router";
import { ConfiguredEntry } from "../identity/configured-entry";
import { useIdentity } from "../identity/context";
import { AccountScreen } from "../identity/account-screen";
import type { MeResponse } from "@joint/contracts";

function ReadyLanding({ me }: { me: MeResponse }): React.JSX.Element {
  const { invitation, workflow } = useIdentity();
  return invitation ||
    workflow.securityOpen ||
    (workflow.view !== undefined && workflow.view !== "account") ? (
    <AccountScreen me={me} />
  ) : (
    <Redirect href={me.membership ? "/home" : "/more"} />
  );
}
export function LandingEntry(): React.JSX.Element {
  return <ConfiguredEntry ready={(me) => <ReadyLanding me={me} />} />;
}
