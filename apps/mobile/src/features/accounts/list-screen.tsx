import { useRouter } from "expo-router";
import { Screen } from "@/components/screen";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { SummaryView } from "../home/summary-view";
import { AccountPage } from "./account-page";
import { AccountRow } from "./account-row";
export function AccountListScreen(): React.JSX.Element {
  const router = useRouter();
  const addAccount = () => router.push("/home/accounts/new");
  return (
    <Screen scrollable={false}>
      <AccountPage
        onAddAccount={addAccount}
        includeBalances
        renderAccount={(account, balance) => (
          <AccountRow
            account={account}
            balance={balance}
            onOpen={() => router.push(`/home/accounts/${account.id}`)}
          />
        )}
      >
        <NativeActions>
          <NativeAction label="Add account" onPress={addAccount} />
        </NativeActions>
        <SummaryView scope={{ kind: "visible" }}>
          <NativeActions>
            <NativeAction
              label="Import CSV"
              onPress={() => router.push("/imports")}
            />
          </NativeActions>
        </SummaryView>
      </AccountPage>
    </Screen>
  );
}
