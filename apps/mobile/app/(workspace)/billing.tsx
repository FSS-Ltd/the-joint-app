import { router } from "expo-router";
import { useIdentity } from "@/features/identity/context";
import { BillingScreen } from "@/features/billing/billing-screen";
import { createBillingApi } from "@/api/billing";

export default function BillingRoute(): React.JSX.Element | null {
  const { state, finance } = useIdentity();
  if (state.kind !== "ready") return null;

  const householdId = state.me.membership?.household.id ?? state.me.user.id;
  return (
    <BillingScreen
      householdId={householdId}
      billingApi={createBillingApi(finance.transport)}
      onBack={() => router.back()}
    />
  );
}
