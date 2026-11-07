import { useState } from "react";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { AccountChoice } from "../accounts/account-choice";
import { ImportBatchBoundary } from "./import-batch-boundary";
import { ImportRowCard } from "./import-row-card";
import { useImportReviewWrite } from "./use-import-review";
import {
  importRowsPage,
  useImportRows,
  type RowsFilter,
} from "./use-import-rows";

const filters = {
  ALL: "All rows",
  REVIEW: "Needs a decision",
  REJECTED: "Rejected",
} as const;

export function ImportReviewScreen({
  batchId,
}: {
  batchId: string;
}): React.JSX.Element {
  const session = useImportReviewWrite(batchId);
  const { draft, mutation, editable } = session;
  const batch = draft.base;
  const [chosenFilter, setFilter] = useState<RowsFilter | null>(null);
  // The page offset belongs to the filter it was chosen under.
  const [page, setPage] = useState<{
    offset: number;
    filter: RowsFilter | null;
  }>({
    offset: 0,
    filter: null,
  });
  // Open on the rows that still need a decision, if any.
  const filter: RowsFilter =
    chosenFilter ?? (batch && batch.overlapRows > 0 ? "REVIEW" : "ALL");
  const offset = page.filter === filter ? page.offset : 0;
  const rows = useImportRows(
    batchId,
    filter,
    offset,
    batch,
    batch !== null && draft.visible && !draft.invalidated,
  );
  const choices = draft.value.choices;
  const dirty = Object.keys(choices).length > 0;
  return (
    <ImportBatchBoundary
      session={session}
      batchId={batchId}
      title="Review rows"
      saved="Decisions saved. Open the import to continue."
      pending="Saving your decisions…"
    >
      {batch && (
        <>
          <AppText>
            Similar purchases can be separate transactions. Choose Keep or Skip
            for each possible overlap before committing; nothing is removed just
            because a date, description and amount match.
          </AppText>
          <AppText accessibilityLiveRegion="polite">
            {batch.overlapRows === 0
              ? "Every possible overlap has a decision."
              : `${batch.overlapRows.toLocaleString("en-GB")} possible overlaps still need a decision.`}
          </AppText>
          <AccountChoice
            label="Show rows"
            value={filter}
            options={["ALL", "REVIEW", "REJECTED"] as const}
            labels={filters}
            onChange={(next) => {
              setFilter(next);
              setPage({ offset: 0, filter: next });
            }}
            disabled={!editable || dirty}
          />
          {rows.state.kind === "loading" && (
            <AppText accessibilityLiveRegion="polite">Loading rows…</AppText>
          )}
          {rows.state.kind === "error" && (
            <>
              <AppText accessibilityLiveRegion="polite">
                {rows.state.message}
              </AppText>
              <NativeActions>
                <NativeAction label="Reload rows" onPress={rows.retry} />
              </NativeActions>
            </>
          )}
          {rows.state.kind === "ready" && (
            <>
              {rows.state.items.length === 0 && (
                <AppText>No rows in this view.</AppText>
              )}
              {rows.state.items.map((row) => (
                <ImportRowCard
                  key={row.rowNumber}
                  row={row}
                  editable={editable}
                  choice={choices[row.rowNumber]}
                  onChoose={(decision) =>
                    draft.change({
                      choices: { ...choices, [row.rowNumber]: decision },
                    })
                  }
                />
              ))}
              <NativeActions>
                <NativeAction
                  label="Previous rows"
                  tone="secondary"
                  disabled={offset === 0 || dirty || !editable}
                  onPress={() =>
                    setPage({
                      offset: Math.max(0, offset - importRowsPage),
                      filter,
                    })
                  }
                />
                <NativeAction
                  label="Next rows"
                  tone="secondary"
                  disabled={
                    rows.state.nextOffset === null || dirty || !editable
                  }
                  onPress={() => {
                    if (
                      rows.state.kind === "ready" &&
                      rows.state.nextOffset !== null
                    )
                      setPage({ offset: rows.state.nextOffset, filter });
                  }}
                />
              </NativeActions>
              {dirty && (
                <AppText accessibilityLiveRegion="polite">
                  Save your choices before changing the view.
                </AppText>
              )}
            </>
          )}
          <NativeActions>
            <NativeAction
              label="Save decisions"
              disabled={!editable || !dirty}
              pending={mutation.kind === "pending"}
              onPress={() => void session.submit()}
            />
          </NativeActions>
        </>
      )}
    </ImportBatchBoundary>
  );
}
