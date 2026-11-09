import { router } from "expo-router";
import { useIdentity } from "@/features/identity/context";
import { CompanionScreen } from "@/features/companion/companion-screen";
import { createDevicesApi } from "@/api/devices";

export default function CompanionRoute(): React.JSX.Element | null {
  const { state, finance } = useIdentity();
  if (state.kind !== "ready") return null;

  const householdId = state.me.membership?.household.id ?? state.me.user.id;
  return (
    <CompanionScreen
      householdId={householdId}
      devicesApi={createDevicesApi(finance.transport)}
      onBack={() => router.back()}
    />
  );
}
