import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import type { ImportAction } from "./action-input";
import { ImportBatchBoundary } from "./import-batch-boundary";
import { useImportActionWrite } from "./use-import-action";

const copy: Record<
  ImportAction,
  {
    title: string;
    body: string;
    button: string;
    saved: string;
    pending: string;
    viewOnly: string;
  }
> = {
  rollback: {
    title: "Roll back this import",
    body: "Rollback removes this import's transactions together. You can restore the import afterwards. It is blocked if any imported transaction has later corrections, classification changes or notes.",
    viewOnly: "This import can no longer be rolled back.",
    button: "Roll back import",
    saved: "Rolled back. Open the import to review it.",
    pending: "Rolling back…",
  },
  restore: {
    title: "Restore this import",
    body: "Restore adds back the same committed rows. Their identities stay the same; this does not create copies.",
    viewOnly: "This import can no longer be restored.",
    button: "Restore import",
    saved: "Restore requested. Open the import to follow its progress.",
    pending: "Queueing the restore…",
  },
  original: {
    title: "Delete the uploaded file",
    body: "This deletes the retained original CSV. Any transactions already imported are not affected, but the file cannot be recovered or checked again.",
    viewOnly: "The uploaded file can no longer be deleted.",
    button: "Delete the uploaded file",
    saved: "The uploaded file was deleted. Open the import to continue.",
    pending: "Deleting the file…",
  },
};
function ActionView({
  batchId,
  action,
}: {
  batchId: string;
  action: ImportAction;
}): React.JSX.Element {
  const session = useImportActionWrite(batchId, action);
  const text = copy[action];
  return (
    <ImportBatchBoundary
      session={session}
      batchId={batchId}
      title={text.title}
      saved={text.saved}
      pending={text.pending}
      viewOnly={text.viewOnly}
      header={(batch) => (
        <AppText tone="secondary">
          {batch.committedRows.toLocaleString("en-GB")} transactions · uploaded{" "}
          {new Date(batch.createdAt).toLocaleDateString("en-GB")}
        </AppText>
      )}
    >
      <AppText>{text.body}</AppText>
      <NativeActions>
        <NativeAction
          label={text.button}
          disabled={!session.editable}
          pending={session.mutation.kind === "pending"}
          onPress={() => void session.submit()}
        />
      </NativeActions>
    </ImportBatchBoundary>
  );
}
export const RollbackScreen = ({ batchId }: { batchId: string }) => (
  <ActionView batchId={batchId} action="rollback" />
);
export const RestoreScreen = ({ batchId }: { batchId: string }) => (
  <ActionView batchId={batchId} action="restore" />
);
export const OriginalScreen = ({ batchId }: { batchId: string }) => (
  <ActionView batchId={batchId} action="original" />
);
