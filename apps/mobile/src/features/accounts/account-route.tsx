import { useLocalSearchParams, useRouter } from "expo-router";
import { EmptyState } from "@/components/empty-state";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Screen } from "@/components/screen";
import { AccountDetailScreen } from "./detail-screen";
import { parseAccountRouteId } from "./route-id";
export function AccountRoute({
  screen: AccountScreen = AccountDetailScreen,
}: {
  screen?: React.ComponentType<{ accountId: string }>;
} = {}): React.JSX.Element {
  const { accountId } = useLocalSearchParams<{
    accountId?: string | string[];
  }>();
  const router = useRouter();
  const id = parseAccountRouteId(accountId);
  return id ? (
    <AccountScreen accountId={id} />
  ) : (
    <Screen>
      <EmptyState
        title="Account link is invalid"
        description="Open an account from your household account list."
      />
      <NativeActions>
        <NativeAction
          label="Open accounts"
          onPress={() => router.replace("/home/accounts")}
        />
      </NativeActions>
    </Screen>
  );
}
