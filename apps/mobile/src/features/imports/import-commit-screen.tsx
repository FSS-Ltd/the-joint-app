import { Host, Switch } from "@expo/ui";
import { useRouter } from "expo-router";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { ImportBatchBoundary } from "./import-batch-boundary";
import { useImportCommitWrite } from "./use-import-review";

const count = (value: number) => value.toLocaleString("en-GB");

export function ImportCommitScreen({
  batchId,
}: {
  batchId: string;
}): React.JSX.Element {
  const router = useRouter();
  const session = useImportCommitWrite(batchId);
  const { draft, mutation, editable } = session;
  const batch = draft.base;
  const blocked = batch !== null && batch.overlapRows > 0;
  const empty = batch !== null && batch.validRows === 0;
  const needsAck = batch !== null && batch.rejectedRows > 0;
  return (
    <ImportBatchBoundary
      session={session}
      batchId={batchId}
      title="Commit import"
      saved="Commit requested. Open the import to follow its progress."
      pending="Queueing the import…"
    >
      {batch && (
        <>
          <AppText>
            {count(batch.validRows)} valid rows, {count(batch.duplicateRows)}{" "}
            duplicates and {count(batch.rejectedRows)} rejected rows were found
            in {count(batch.totalRows)} rows.
          </AppText>
          <AppText>
            Only kept, valid rows will enter activity, and none appear there
            until the whole import succeeds.
          </AppText>
          {blocked && (
            <>
              <AppText accessibilityLiveRegion="polite">
                {count(batch.overlapRows)} possible overlaps still need a Keep
                or Skip decision.
              </AppText>
              <NativeActions>
                <NativeAction
                  label="Review rows"
                  tone="secondary"
                  // Replace, so going back never lands on this screen with stale counts.
                  onPress={() => router.replace(`/imports/${batchId}/review`)}
                />
              </NativeActions>
            </>
          )}
          {empty && (
            <AppText accessibilityLiveRegion="polite">
              There are no valid rows to import.
            </AppText>
          )}
          {needsAck && (
            <Host matchContents={{ vertical: true }}>
              <Switch
                label={`I understand that ${count(batch.rejectedRows)} rejected ${batch.rejectedRows === 1 ? "row" : "rows"} will not be imported`}
                value={draft.value.acknowledged}
                disabled={!editable}
                onValueChange={(acknowledged) => draft.change({ acknowledged })}
              />
            </Host>
          )}
          <NativeActions>
            <NativeAction
              label="Commit import"
              disabled={
                !editable ||
                blocked ||
                empty ||
                (needsAck && !draft.value.acknowledged)
              }
              pending={mutation.kind === "pending"}
              onPress={() => void session.submit()}
            />
          </NativeActions>
        </>
      )}
    </ImportBatchBoundary>
  );
}
