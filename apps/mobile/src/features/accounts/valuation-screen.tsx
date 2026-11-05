import { Host, Switch } from "@expo/ui";
import { randomUUID } from "expo-crypto";
import { isLiabilityKind } from "@joint/domain";
import { AppText } from "@/components/app-text";
import { NativeField } from "@/components/native-field";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { useAccountWrite } from "./use-account-write";
import { valuationInput, type ValuationDraft } from "./write-input";
import { WriteBoundary } from "./write-boundary";
const empty = (): ValuationDraft => ({
  amount: "",
  date: "",
  attested: false,
  adultAmount: "",
});
export function ValuationScreen({
  accountId,
}: {
  accountId: string;
}): React.JSX.Element {
  const session = useAccountWrite(accountId, "valuation", empty, empty);
  const { draft, account, editable } = session;
  const debt = account && isLiabilityKind(account.kind);
  function save() {
    if (!account || !editable) return;
    const input = valuationInput(account, draft.value);
    if (!input.ok) {
      draft.error(input.message);
      return;
    }
    void session.submit({
      kind: "valuation",
      input: input.value,
      key: randomUUID(),
    });
  }
  return (
    <WriteBoundary session={session} title="Record a valuation">
      <AppText>
        {debt
          ? "Enter the outstanding debt as a nonnegative GBP amount."
          : "Enter the GBP balance. Assets can have a negative value."}
      </AppText>
      <NativeField
        label={debt ? "Outstanding debt in GBP" : "Value in GBP"}
        value={draft.value.amount}
        onChangeText={(amount) => draft.change({ ...draft.value, amount })}
        keyboardType="numbers-and-punctuation"
        editable={editable}
      />
      <NativeField
        label="Valuation date (YYYY-MM-DD)"
        value={draft.value.date}
        onChangeText={(date) => draft.change({ ...draft.value, date })}
        placeholder="YYYY-MM-DD"
        maxLength={10}
        editable={editable}
      />
      <AppText>
        Use the date of the evidence, never a future date. The server checks
        dates in Europe/London.
      </AppText>
      <Host matchContents={{ vertical: true }}>
        <Switch
          label="I attest the adult-owned portion"
          value={draft.value.attested}
          disabled={!editable}
          onValueChange={(attested) =>
            draft.change({ ...draft.value, attested, adultAmount: "" })
          }
        />
      </Host>
      {draft.value.attested ? (
        <>
          <AppText>
            {debt
              ? "Attest the full outstanding debt."
              : "Exclude child-owned funds. For a negative asset, enter the full negative balance."}
          </AppText>
          <NativeField
            label="Adult-owned portion in GBP"
            value={draft.value.adultAmount}
            onChangeText={(adultAmount) =>
              draft.change({ ...draft.value, adultAmount })
            }
            keyboardType="numbers-and-punctuation"
            editable={editable}
          />
        </>
      ) : (
        <AppText>
          The adult portion stays unknown and is excluded from adult wealth
          totals until you attest it.
        </AppText>
      )}
      <NativeActions>
        <NativeAction
          label="Save valuation"
          disabled={!editable}
          pending={session.mutation.kind === "pending"}
          onPress={save}
        />
      </NativeActions>
    </WriteBoundary>
  );
}
