import { router } from "expo-router";
import { useIdentity } from "@/features/identity/context.js";
import { CompanionScreen } from "@/features/companion/companion-screen.js";
import { createDevicesApi } from "@/api/devices.js";

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
