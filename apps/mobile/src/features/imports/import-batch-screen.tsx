import { useRouter } from "expo-router";
import type { ImportBatchResponse } from "@joint/contracts";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { Screen } from "@/components/screen";
import { useImportBatch } from "./use-import-batch";

const stateLabels: Record<ImportBatchResponse["state"], string> = {
  QUEUED: "Waiting to start",
  PREVIEWING: "Checking rows",
  READY: "Preview ready",
  COMMITTING: "Adding rows to activity",
  COMMITTED: "Imported",
  ROLLED_BACK: "Rolled back",
  FAILED: "Failed",
  EXPIRED: "Expired",
};
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
