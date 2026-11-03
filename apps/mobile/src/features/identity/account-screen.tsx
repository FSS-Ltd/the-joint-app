import type { MeResponse } from "@joint/contracts";
import { useState, useSyncExternalStore } from "react";
import { AppText } from "@/components/app-text";
import { IdentityFrame } from "@/components/identity-frame";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import {
  AcceptInvitation,
  CreateHousehold,
  InviteAdult,
} from "./household-forms";
import { useIdentity } from "./context";
import { SecurityScreen } from "./security-screen";
import { SessionActions } from "./session-actions";
export function AccountScreen({ me }: { me: MeResponse }): React.JSX.Element {
  const { workflow } = useIdentity();
  useSyncExternalStore(
    workflow.subscribe,
    workflow.getSnapshot,
    workflow.getSnapshot,
  );
  const [individual, setIndividual] = useState(false);
  if (workflow.securityOpen)
    return <SecurityScreen onBack={() => workflow.showSecurity(false)} />;
  return (
    <IdentityFrame
      title={me.membership?.household.name ?? "Your account, your choice."}
      description="Keep your own identity. Choose what you share."
    >
      <AppText>{me.user.email}</AppText>
      <AcceptInvitation />
      {me.membership ? (
        <>
          <AppText variant="title">Your household</AppText>
          <AppText>
            {me.membership.household.memberCount} of 2 adults ·{" "}
            {me.membership.household.baseCurrency} ·{" "}
            {me.membership.household.timezone}
          </AppText>
          <InviteAdult me={me} />
        </>
      ) : individual ? (
        <>
          <AppText>
            Your individual account is ready. You can create a household
            whenever you choose.
          </AppText>
          <NativeActions>
            <NativeAction
              label="Set up a household"
              onPress={() => setIndividual(false)}
            />
          </NativeActions>
        </>
      ) : (
        <>
          <CreateHousehold />
          <NativeActions>
            <NativeAction
              label="Continue on my own"
              tone="text"
              onPress={() => setIndividual(true)}
            />
          </NativeActions>
        </>
      )}
      <NativeActions>
        <NativeAction
          label="Account security"
          tone="text"
          onPress={() => workflow.showSecurity(true)}
        />
      </NativeActions>
      <SessionActions />
    </IdentityFrame>
  );
}
