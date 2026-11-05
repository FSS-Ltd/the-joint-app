import {
  accountCreateSchema,
  accountKindSchema,
  type AccountResponse,
} from "@joint/contracts";
import { randomUUID } from "expo-crypto";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { Screen } from "@/components/screen";
import { useNativeFinance } from "../finance/context";
import { financeErrorMessage } from "../finance/errors";
import { useFinanceMutation } from "../finance/use-mutation";
import { AccountChoice } from "./account-choice";
import { kinds } from "./account-labels";
import { MetadataFields } from "./metadata-fields";
import { useWriteDraft } from "./use-write-draft";
import { metadataInput, type MetadataDraft } from "./write-input";
import { createAccountIntent } from "./write-intent";
import { WriteFeedback } from "./write-feedback";
type CreateDraft = MetadataDraft & { kind: AccountResponse["kind"] };
const empty = (): CreateDraft => ({
  label: "",
  liquidity: "AVAILABLE",
  kind: "CURRENT",
});
export function CreateAccountScreen(): React.JSX.Element {
  const finance = useNativeFinance(),
    draft = useWriteDraft("create-account", empty);
  const mutation = useFinanceMutation<AccountResponse>("create-account");
  const editable = draft.visible && mutation.kind === "idle";
  async function save() {
    if (!editable) return;
    const metadata = metadataInput({
      label: draft.value.label,
      liquidity: draft.value.liquidity,
    });
    if (!metadata.ok) {
      draft.error(metadata.message);
      return;
    }
    try {
      const input = accountCreateSchema.parse({
        ...metadata.value,
        kind: draft.value.kind,
        currency: "GBP",
      });
      await mutation.submit(createAccountIntent(finance, input, randomUUID()));
    } catch (error) {
      draft.error(financeErrorMessage(error));
    }
  }
  return (
    <Screen>
      <Panel>
        <AppText variant="heading" accessibilityRole="header">
          Create an account
        </AppText>
        {draft.visible ? (
          <>
            {mutation.kind !== "success" && (
              <>
                <AppText>
                  This manual account starts private, in GBP, with you as its
                  legal owner. Record a valuation after creating it.
                </AppText>
                <MetadataFields
                  value={draft.value}
                  onChange={(value) =>
                    draft.change({ ...draft.value, ...value })
                  }
                  disabled={!editable}
                />
                <AccountChoice
                  label="Account type"
                  value={draft.value.kind}
                  options={accountKindSchema.options}
                  labels={kinds}
                  disabled={!editable}
                  onChange={(kind) => draft.change({ ...draft.value, kind })}
                />
                <NativeActions>
                  <NativeAction
                    label="Create private account"
                    pending={mutation.kind === "pending"}
                    disabled={!editable}
                    onPress={() => void save()}
                  />
                </NativeActions>
              </>
            )}
            {draft.message !== "" && (
              <AppText accessibilityLiveRegion="polite">
                {draft.message}
              </AppText>
            )}
            <WriteFeedback
              mutation={mutation}
              reload={() => {
                mutation.reset();
                draft.clear();
              }}
            />
          </>
        ) : (
          <AppText>Checking household access…</AppText>
        )}
      </Panel>
    </Screen>
  );
}
