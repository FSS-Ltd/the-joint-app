import type { AccountResponse } from "@joint/contracts";
import { Panel } from "@/components/panel";
import { AppText } from "@/components/app-text";
import { NativeActions } from "@/components/native-actions";
import { NativeAction } from "@/components/native-action";
import { AccountFacts } from "./account-facts";

export function AccountRow({
  account,
  onOpen,
}: {
  account: AccountResponse;
  onOpen(): void;
}): React.JSX.Element {
  return (
    <Panel>
      <AppText variant="title" accessibilityRole="header">
        {account.label}
      </AppText>
      <AccountFacts account={account} />
      <NativeActions>
        <NativeAction
          label={`Open ${account.label}`}
          tone="secondary"
          onPress={onOpen}
        />
      </NativeActions>
    </Panel>
  );
}
