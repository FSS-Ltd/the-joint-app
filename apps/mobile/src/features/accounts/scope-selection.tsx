import { useState } from "react";
import { Host, Switch } from "@expo/ui";
import { scopeAccountIdsSchema } from "@joint/contracts";
import { AppText } from "@/components/app-text";
import { Panel } from "@/components/panel";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { AccountPage } from "./account-page";
import { ownerLabel, grantLabels } from "./account-labels";

export function ScopeSelection({
  initialIds,
  onApply,
  onCancel,
}: {
  initialIds: readonly string[];
  onApply(ids: string[]): void;
  onCancel(): void;
}): React.JSX.Element {
  const [selected, setSelected] = useState<string[]>(() => [...initialIds]);
  const toggle = (accountId: string, included: boolean) => {
    setSelected((previous) => {
      if (!included) return previous.filter((id) => id !== accountId);
      if (previous.includes(accountId) || previous.length >= 50)
        return previous;
      return [...previous, accountId];
    });
  };
  const apply = () => {
    const result = scopeAccountIdsSchema.safeParse(selected);
    if (result.success) onApply(result.data);
  };
  return (
    <AccountPage
      extraData={selected}
      renderAccount={(account) => {
        const checked = selected.includes(account.id);
        return (
          <Panel>
            <AppText>
              {ownerLabel(account)} · {grantLabels[account.access]}
            </AppText>
            <Host matchContents={{ vertical: true }} colorScheme="light">
              <Switch
                label={`Include ${account.label} in summary`}
                value={checked}
                disabled={!checked && selected.length >= 50}
                onValueChange={(included) => toggle(account.id, included)}
              />
            </Host>
          </Panel>
        );
      }}
    >
      <Panel>
        <AppText variant="title" accessibilityRole="header">
          Choose summary accounts
        </AppText>
        <AppText>{selected.length} of 50 selected</AppText>
        <AppText>
          Select 1–50 accounts across live account pages. Selection retains
          identifiers only, not old balances.
        </AppText>
        <NativeActions>
          <NativeAction
            label="Use selected accounts"
            disabled={selected.length === 0}
            onPress={apply}
          />
          <NativeAction
            label="Clear selection"
            tone="secondary"
            disabled={selected.length === 0}
            onPress={() => setSelected([])}
          />
          <NativeAction
            label="Cancel selection"
            tone="text"
            onPress={onCancel}
          />
        </NativeActions>
      </Panel>
    </AccountPage>
  );
}
