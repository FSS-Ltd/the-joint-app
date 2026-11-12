import { MAX_CSV_BYTES } from "@joint/contracts";
import { useState } from "react";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { ImportBoundary } from "./import-boundary";
import { MappingFields } from "./mapping-fields";
import { OpeningBalance } from "./opening-balance";
import { mappingInput, missingRequired } from "./import-mapping";
import { useImportFlow } from "./use-import-flow";
import { useStatementConverter } from "../statements/use-statement-converter";
import { StatementReviewScreen } from "../statements/statement-review-screen";

export function ImportScreen({
  accountId,
}: {
  accountId: string;
}): React.JSX.Element {
  const flow = useImportFlow(accountId);
  const converter = useStatementConverter();
  const { draft, mutation, editable, localMappingEditable, busy } = flow;
  const { file, inspection, mapping } = draft.value;
  const [editing, setEditing] = useState<typeof inspection>(null);
  const suggested = inspection?.suggestedMapping !== undefined;
  const valid = inspection
    ? mappingInput(mapping, inspection.columns.length).ok &&
      (!inspection.requiresCurrencyColumn || mapping.currency !== "")
    : false;
  const editAll = !suggested || editing === inspection;
  const missingOnly =
    !editAll &&
    !valid &&
    missingRequired(mapping, inspection?.requiresCurrencyColumn);

  if (converter.state.status === "reviewing" && converter.state.file) {
    return (
      <StatementReviewScreen
        fileName={converter.state.file.name}
        pageCount={converter.state.pageCount}
        rows={converter.state.rows}
        reconciliation={converter.state.reconciliation}
        onToggleExclude={converter.toggleRowExcluded}
        onAcceptAndConvert={() =>
          converter.generateCsvAndHandoff((csvFile) =>
            flow.loadGeneratedCsv(csvFile),
          )
        }
        onCancel={converter.cancel}
      />
    );
  }

  return (
    <ImportBoundary flow={flow}>
      <AppText>
        Choose a CSV of up to {MAX_CSV_BYTES / 1024 / 1024} MiB, or convert a
        PDF statement directly on your device. This step uploads the file so it
        can be checked. Nothing is added to your activity.
      </AppText>
      <NativeActions>
        <NativeAction
          label={file ? "Choose a different file" : "Choose a CSV file"}
          tone={file ? "secondary" : "primary"}
          disabled={!editable || converter.state.status === "reading"}
          pending={busy === "reading"}
          onPress={() => void flow.chooseFile()}
        />
        {!file && (
          <NativeAction
            label="Convert from PDF Statement"
            tone="secondary"
            disabled={!editable || busy !== null}
            pending={converter.state.status === "reading"}
            onPress={() => void converter.pickAndExtract()}
          />
        )}
      </NativeActions>
      {converter.state.status === "error" && converter.state.errorMessage && (
        <AppText accessibilityRole="alert">
          {converter.state.errorMessage}
        </AppText>
      )}
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
            {inspection.columns.length} columns.
          </AppText>
          {suggested && (
            <>
              <AppText variant="title" accessibilityRole="header">
                Columns detected
              </AppText>
              <AppText>
                {valid
                  ? "Review the detected settings before preview."
                  : "Complete the missing settings before preview."}
              </AppText>
              {valid && (
                <AppText>{mappingSummary(mapping, inspection.columns)}</AppText>
              )}
              {!editAll && (
                <NativeActions>
                  <NativeAction
                    label="Edit all columns and settings"
                    tone="secondary"
                    disabled={!localMappingEditable}
                    onPress={() => setEditing(inspection)}
                  />
                </NativeActions>
              )}
            </>
          )}
          {(editAll || !valid) && (
            <MappingFields
              value={mapping}
              columns={inspection.columns}
              onChange={flow.changeMapping}
              disabled={!localMappingEditable}
              missingOnly={missingOnly}
              requiresCurrencyColumn={inspection.requiresCurrencyColumn}
            />
          )}
          {(flow.needsOpening ||
            flow.statementAvailable ||
            flow.openingMutation.kind !== "idle") && (
            <OpeningBalance
              flow={flow}
              statement={
                flow.statementAvailable
                  ? inspection.statementBalance
                  : undefined
              }
            />
          )}
          <NativeActions>
            <NativeAction
              label="Start preview"
              disabled={!editable || flow.needsOpening || (suggested && !valid)}
              pending={mutation.kind === "pending"}
              onPress={() => void flow.submit()}
            />
          </NativeActions>
        </>
      )}
    </ImportBoundary>
  );
}

function mappingSummary(
  mapping: import("./import-mapping").MappingDraft,
  columns: readonly import("@joint/contracts").CsvColumn[],
): string {
  const label = (index: string) =>
    columns.find((column) => String(column.index) === index)?.label ?? "";
  const parts = [
    `Date: ${label(mapping.date)} (${mapping.dateFormat})`,
    `Description: ${label(mapping.description)}`,
    mapping.amountMode === "SIGNED"
      ? `Amount: ${label(mapping.amount)} (positive is ${mapping.positiveIs === "INFLOW" ? "money in" : "money out"})`
      : `Debit: ${label(mapping.debit)}; credit: ${label(mapping.credit)}`,
    `Decimal separator: ${mapping.decimalSeparator === "DOT" ? "dot" : "comma"}`,
  ];
  if (mapping.currency) parts.push(`Currency: ${label(mapping.currency)}`);
  if (mapping.sourceId) parts.push(`Source ID: ${label(mapping.sourceId)}`);
  return parts.join(" · ");
}
