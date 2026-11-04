import { useRouter } from "expo-router";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/app-text";
import { AccountPage } from "./account-page";
import { AccountRow } from "./account-row";
export function AccountListScreen(): React.JSX.Element {
  const router = useRouter();
  return (
    <Screen scrollable={false}>
      <AccountPage
        renderAccount={(account) => (
          <AccountRow
            account={account}
            onOpen={() => router.push(`/home/accounts/${account.id}`)}
          />
        )}
      >
        <AppText variant="heading" tone="inverse" accessibilityRole="header">
          Accounts
        </AppText>
      </AccountPage>
    </Screen>
  );
}
