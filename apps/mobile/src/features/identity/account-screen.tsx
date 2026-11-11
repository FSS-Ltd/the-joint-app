import type { MeResponse } from "@joint/contracts";
import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppText } from "@/components/app-text";
import { IdentityFrame } from "@/components/identity-frame";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import {
  AcceptInvitation,
  CreateHousehold,
  InviteAdult,
} from "./household-forms";
import { ArchiveScreen } from "../privacy/archive-screen";
import { PrivacyScreen } from "../privacy/privacy-screen";
import { BillingScreen } from "../billing/billing-screen";
import { createBillingApi } from "../../api/billing";
import { CompanionScreen } from "../companion/companion-screen";
import { createDevicesApi } from "../../api/devices";
import { useIdentity } from "./context";
import { SecurityScreen } from "./security-screen";
import { SessionActions } from "./session-actions";
export function AccountScreen({ me }: { me: MeResponse }): React.JSX.Element {
  const identity = useIdentity();
  const router = useRouter();
  const { setup } = useLocalSearchParams<{ setup?: string }>();
  const { workflow } = identity;
  useSyncExternalStore(
    workflow.subscribe,
    workflow.getSnapshot,
    workflow.getSnapshot,
  );
  const [individual, setIndividual] = useState(false);
  if (workflow.securityOpen || workflow.view === "security")
    return <SecurityScreen onBack={() => workflow.showSecurity(false)} />;
  if (workflow.view === "billing")
    return (
      <BillingScreen
        householdId={me.membership?.household.id ?? me.user.id}
        billingApi={createBillingApi(identity.finance.transport)}
        onBack={() => workflow.showView("account")}
      />
    );
  if (workflow.view === "companion")
    return (
      <CompanionScreen
        householdId={me.membership?.household.id ?? me.user.id}
        devicesApi={createDevicesApi(identity.finance.transport)}
        onBack={() => workflow.showView("account")}
      />
    );
  if (workflow.view === "privacy")
    return (
      <PrivacyScreen
        me={me}
        onBack={() => workflow.showView("account")}
        onOpenArchive={() => workflow.showView("archive")}
        onOpenSecurity={() => workflow.showSecurity(true, "privacy")}
      />
    );
  if (workflow.view === "archive")
    return (
      <ArchiveScreen
        me={me}
        onBack={() => workflow.showView("account")}
        onOpenPrivacy={() => workflow.showView("privacy")}
        onOpenSecurity={() => workflow.showSecurity(true, "archive")}
      />
    );
  if (
    setup === "invite" &&
    !identity.invitation &&
    me.membership?.role === "ADMIN" &&
    me.membership.household.memberCount < 2
  )
    return (
      <IdentityFrame
        title="A shared view, at your pace"
        description="Set up transparent domestic accounts together or begin privately."
      >
        <InviteAdult
          me={me}
          onboarding
          onInviteLater={() => {
            router.setParams({ setup: undefined });
            router.replace("/home/accounts");
          }}
        />
      </IdentityFrame>
    );
  return (
    <IdentityFrame
      title={me.membership?.household.name ?? "A shared view, at your pace"}
      description={
        me.membership
          ? "Keep your own sign-in and choose which accounts to share."
          : "Start on your own and invite another adult when you’re ready."
      }
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
          label="Local companion (Mac)"
          tone="secondary"
          onPress={() => workflow.showView("companion")}
        />
        <NativeAction
          label="Subscription and billing"
          tone="secondary"
          onPress={() => workflow.showView("billing")}
        />
        <NativeAction
          label="Privacy and data"
          tone="secondary"
          onPress={() => workflow.showView("privacy")}
        />
        <NativeAction
          label="Owner archive"
          tone="secondary"
          onPress={() => workflow.showView("archive")}
        />
        <NativeAction
          label="Account security"
          tone="text"
          onPress={() => workflow.showSecurity(true, "account")}
        />
      </NativeActions>
      <SessionActions />
    </IdentityFrame>
  );
}
