import { useEffect, useRef } from "react";
import { useIsFocused, useRouter } from "expo-router";
import { AppText } from "@/components/app-text";
import { EmptyState } from "@/components/empty-state";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { Screen } from "@/components/screen";
import { stateLabels } from "./import-state-labels";
import { useImportHistory } from "./use-import-history";

const count = (value: number) => value.toLocaleString("en-GB");

export function ImportHistoryScreen({
  accountId,
}: {
  accountId: string;
}): React.JSX.Element {
  const router = useRouter();
  const history = useImportHistory(accountId);
  const { state } = history;
  // Coming back from a batch after an action: show its new state.
  const focused = useIsFocused();
  const wasFocused = useRef(focused);
  useEffect(() => {
    if (focused && !wasFocused.current) history.retry();
    wasFocused.current = focused;
  }, [focused]);
  return (
    <Screen>
      <Panel>
        <AppText variant="heading" accessibilityRole="header">
          Import history
        </AppText>
        {state.kind === "loading" && (
          <AppText accessibilityLiveRegion="polite">Loading imports…</AppText>
        )}
        {state.kind === "error" && (
          <>
            <AppText accessibilityLiveRegion="polite">{state.message}</AppText>
            <NativeActions>
              <NativeAction label="Retry imports" onPress={history.retry} />
            </NativeActions>
          </>
        )}
        {state.kind === "ready" && state.items.length === 0 && (
          <EmptyState
            title="No imports yet"
            description="Imports for this account appear here once a file has been uploaded."
          />
        )}
        {state.kind === "ready" && state.items.length > 0 && (
          <NativeActions>
            {state.items.map((batch) => (
              <NativeAction
                key={batch.id}
                label={`${stateLabels[batch.state]} · ${new Date(batch.createdAt).toLocaleDateString("en-GB")} · ${count(batch.totalRows)} rows`}
                tone="secondary"
                onPress={() => router.push(`/imports/${batch.id}`)}
              />
            ))}
          </NativeActions>
        )}
        {history.moreError && (
          <AppText accessibilityLiveRegion="polite">
            {history.moreError}
          </AppText>
        )}
        {state.kind === "ready" && state.cursor && (
          <NativeActions>
            <NativeAction
              label="Load more imports"
              tone="secondary"
              pending={history.moreLoading}
              onPress={history.loadMore}
            />
          </NativeActions>
        )}
        <NativeActions>
          <NativeAction
            label="Start a new import"
            onPress={() => router.push(`/imports/upload/${accountId}`)}
          />
        </NativeActions>
      </Panel>
    </Screen>
  );
}
