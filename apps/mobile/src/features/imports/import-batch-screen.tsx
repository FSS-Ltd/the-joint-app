import { useRouter } from "expo-router";
import type { ImportBatchResponse } from "@joint/contracts";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { Screen } from "@/components/screen";
import { actionAllowed } from "./action-input";
import { stateLabels } from "./import-state-labels";
import { useImportBatch } from "./use-import-batch";

const count = (value: number) => value.toLocaleString("en-GB");

export function ImportBatchScreen({
  batchId,
}: {
  batchId: string;
}): React.JSX.Element {
  const router = useRouter();
  const batch = useImportBatch(batchId);
  return (
    <Screen>
      <Panel>
        <AppText variant="heading" accessibilityRole="header">
          Import
        </AppText>
        {batch.kind === "loading" && (
          <AppText accessibilityLiveRegion="polite">Loading import…</AppText>
        )}
        {batch.kind === "error" && (
          <>
            <AppText accessibilityLiveRegion="polite">{batch.message}</AppText>
            <NativeActions>
              <NativeAction label="Retry import" onPress={batch.retry} />
            </NativeActions>
          </>
        )}
        {batch.kind === "ready" && <BatchFacts batch={batch.value} />}
        {batch.kind === "ready" && (
          <BatchLifecycleActions batchId={batchId} batch={batch.value} />
        )}
        {batch.kind === "ready" &&
          batch.value.state === "READY" &&
          batch.value.permissions.canCommit && (
            <NativeActions>
              <NativeAction
                label="Review rows"
                onPress={() => router.push(`/imports/${batchId}/review`)}
              />
              <NativeAction
                label="Commit import"
                tone="secondary"
                onPress={() => router.push(`/imports/${batchId}/commit`)}
              />
            </NativeActions>
          )}
        <NativeActions>
          <NativeAction
            label="Back to imports"
            tone="secondary"
            onPress={() => router.replace("/imports")}
          />
        </NativeActions>
      </Panel>
    </Screen>
  );
}

function BatchFacts({
  batch,
}: {
  batch: ImportBatchResponse;
}): React.JSX.Element {
  return (
    <>
      <AppText variant="title" accessibilityLiveRegion="polite">
        {stateLabels[batch.state]}
      </AppText>
      <AppText>
        {count(batch.processedRows)} of {count(batch.totalRows)} rows checked
      </AppText>
      <AppText tone="secondary">
        {count(batch.validRows)} valid · {count(batch.rejectedRows)} rejected ·{" "}
        {count(batch.overlapRows)} possible overlaps ·{" "}
        {count(batch.duplicateRows)} duplicates
      </AppText>
      {batch.committedRows > 0 && (
        <AppText>{count(batch.committedRows)} rows added to activity.</AppText>
      )}
      {batch.failureCode && (
        <AppText accessibilityLiveRegion="polite">
          This import could not finish. Start again with the file.
        </AppText>
      )}
      <AppText tone="secondary">
        {batch.originalAvailable
          ? "The uploaded original is retained for now."
          : "The uploaded original is no longer retained."}
      </AppText>
    </>
  );
}

/** Rollback, restore and original deletion, each only when the server grants it. */
function BatchLifecycleActions({
  batchId,
  batch,
}: {
  batchId: string;
  batch: ImportBatchResponse;
}): React.JSX.Element | null {
  const router = useRouter();
  const go = (path: string) => () => router.push(`/imports/${batchId}/${path}`);
  const rollback = actionAllowed(batch, "rollback");
  const restore = actionAllowed(batch, "restore");
  const original = actionAllowed(batch, "original");
  if (!rollback && !restore && !original) return null;
  return (
    <NativeActions>
      {rollback && (
        <NativeAction
          label="Roll back import"
          tone="secondary"
          onPress={go("rollback")}
        />
      )}
      {restore && (
        <NativeAction label="Restore import" onPress={go("restore")} />
      )}
      {original && (
        <NativeAction
          label="Delete the uploaded file"
          tone="secondary"
          onPress={go("original")}
        />
      )}
    </NativeActions>
  );
}
