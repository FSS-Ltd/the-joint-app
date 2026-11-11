import { Host, Switch } from "@expo/ui";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { colors, corners, spacing } from "@/theme/tokens";
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
      title="Review CSV import"
      saved="Commit requested. Open the import to follow its progress."
      pending="Queueing the import…"
    >
      {batch && (
        <>
          <View style={styles.metrics}>
            {[
              { label: "Valid rows", value: batch.validRows },
              { label: "Duplicates", value: batch.duplicateRows },
              { label: "Rejected rows", value: batch.rejectedRows },
            ].map(({ label, value }) => (
              <View key={label} style={styles.metric}>
                <AppText variant="title">{count(value)}</AppText>
                <AppText tone="secondary">{label}</AppText>
              </View>
            ))}
          </View>
          <AppText>{count(batch.totalRows)} rows in this file.</AppText>
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
            {mutation.kind === "idle" && (
              <NativeAction
                label="Cancel"
                tone="secondary"
                onPress={() => router.replace(`/imports/${batchId}`)}
              />
            )}
          </NativeActions>
        </>
      )}
    </ImportBatchBoundary>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.small },
  metric: {
    flexGrow: 1,
    flexBasis: 90,
    alignItems: "center",
    padding: spacing.medium,
    backgroundColor: colors.sage,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: corners.surface,
  },
});
