import type { AccountResponse } from "@joint/contracts";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { MetadataFields } from "./metadata-fields";
import { useAccountWrite } from "./use-account-write";
import { metadataInput, type MetadataDraft } from "./write-input";
import { WriteBoundary } from "./write-boundary";
const empty = (): MetadataDraft => ({ label: "", liquidity: "AVAILABLE" });
const initial = (account: AccountResponse): MetadataDraft => ({
  label: account.label,
  liquidity: account.liquidity,
});
export function EditAccountScreen({
  accountId,
}: {
  accountId: string;
}): React.JSX.Element {
  const session = useAccountWrite(accountId, "metadata", empty, initial);
  function save() {
    if (!session.editable) return;
    const input = metadataInput(session.draft.value);
    if (!input.ok) {
      session.draft.error(input.message);
      return;
    }
    void session.submit({ kind: "metadata", input: input.value });
  }
  return (
    <WriteBoundary session={session} title="Edit account details">
      <MetadataFields
        value={session.draft.value}
        onChange={session.draft.change}
        disabled={!session.editable}
      />
      <NativeActions>
        <NativeAction
          label="Save account details"
          disabled={!session.editable}
          pending={session.mutation.kind === "pending"}
          onPress={save}
        />
      </NativeActions>
    </WriteBoundary>
  );
}
