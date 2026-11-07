import { MAX_CSV_BYTES } from "@joint/contracts";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { ImportBoundary } from "./import-boundary";
import { MappingFields } from "./mapping-fields";
import { useImportFlow } from "./use-import-flow";

export function ImportScreen({
  accountId,
}: {
  accountId: string;
}): React.JSX.Element {
  const flow = useImportFlow(accountId);
  const { draft, mutation, editable, busy } = flow;
  const { file, inspection, mapping } = draft.value;
  return (
    <ImportBoundary flow={flow}>
      <AppText>
        Choose a CSV of up to {MAX_CSV_BYTES / 1024 / 1024} MiB. This step
        uploads the file so it can be checked. Nothing is added to your
        activity.
      </AppText>
      <NativeActions>
        <NativeAction
          label={file ? "Choose a different file" : "Choose a CSV file"}
          tone={file ? "secondary" : "primary"}
          disabled={!editable}
          pending={busy === "reading"}
          onPress={() => void flow.chooseFile()}
        />
      </NativeActions>
      {file && (
        <AppText accessibilityLiveRegion="polite">
          {file.name} · {(file.bytes.byteLength / 1024).toFixed(1)} KiB
        </AppText>
      )}
      {file && !inspection && (
        <NativeActions>
          <NativeAction
            label="Check the file"
            disabled={!editable}
            pending={busy === "inspecting"}
            onPress={() => void flow.inspect()}
          />
        </NativeActions>
      )}
      {mutation.kind === "error" && mutation.recovery !== "security" && (
        <NativeActions>
          <NativeAction
            label="Change the mapping and try again"
            tone="secondary"
            onPress={flow.editAgain}
          />
        </NativeActions>
      )}
      {inspection && (
        <>
          <AppText accessibilityLiveRegion="polite">
            {inspection.rowCount.toLocaleString("en-GB")} data rows ·{" "}
            {inspection.columns.length} columns. Match each field to a column.
          </AppText>
          <MappingFields
            value={mapping}
            columns={inspection.columns}
            onChange={flow.changeMapping}
            disabled={!editable}
          />
          <NativeActions>
            <NativeAction
              label="Start preview"
              disabled={!editable}
              pending={mutation.kind === "pending"}
              onPress={() => void flow.submit()}
            />
          </NativeActions>
        </>
      )}
    </ImportBoundary>
  );
}
