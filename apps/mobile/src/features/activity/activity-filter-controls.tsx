import { useState } from "react";
import {
  classificationKindSchema,
  monthSchema,
  transactionListQueryBase,
  type ClassificationKind,
} from "@joint/contracts";
import { Host, Switch } from "@expo/ui";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { NativeField } from "@/components/native-field";
import { Panel } from "@/components/panel";
import { colors, spacing } from "@/theme/tokens";
import { AccountChoice } from "../accounts/account-choice";
import {
  emptyActivityFilters,
  type ActivityFilterDraft,
} from "./activity-query";

type ClassificationOption = "ALL" | ClassificationKind;
const classifications = [
  "ALL",
  ...classificationKindSchema.options,
] as readonly ClassificationOption[];
const classificationLabels: Record<ClassificationOption, string> = {
  ALL: "All classifications",
  EXPENSE: "Expense",
  INCOME: "Income",
  REFUND: "Refund",
  TRANSFER: "Transfer",
  DEBT_PAYMENT: "Debt payment",
  PRINCIPAL: "Principal",
  CONTRIBUTION: "Contribution",
  UNCLASSIFIED: "Unclassified",
};

export function ActivityFilterControls({
  applied,
  filterCount,
  onChange,
}: {
  applied: ActivityFilterDraft;
  filterCount: number;
  onChange(next: ActivityFilterDraft): void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<ActivityFilterDraft>(emptyActivityFilters);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 380 || fontScale >= 1.3;
  const search = () => {
    const value = draft.search.trim();
    if (
      value &&
      !transactionListQueryBase.shape.search.safeParse(value).success
    ) {
      setSearchError("Enter up to 120 supported characters to search.");
      return;
    }
    setSearchError(null);
    onChange({ ...applied, search: value });
  };
  const apply = () => {
    if (draft.month && !monthSchema.safeParse(draft.month).success) {
      setFilterError("Enter a month as YYYY-MM.");
      return;
    }
    setFilterError(null);
    onChange({ ...draft, search: applied.search });
    setFiltersOpen(false);
  };
  return (
    <>
      <Panel>
        <View style={[styles.searchBar, stacked && styles.stacked]}>
          <View style={stacked ? undefined : styles.searchInput}>
            <NativeField
              label="Search transactions"
              value={draft.search}
              onChangeText={(search) => setDraft({ ...draft, search })}
              returnKeyType="search"
              onSubmitEditing={search}
            />
          </View>
          <Host
            colorScheme="light"
            seedColor={colors.action}
            matchContents={{ horizontal: !stacked, vertical: true }}
          >
            <NativeAction
              label={
                filtersOpen
                  ? "Hide filters"
                  : filterCount
                    ? `Filters (${filterCount})`
                    : "Filters"
              }
              compact={!stacked}
              tone="secondary"
              onPress={() => setFiltersOpen(!filtersOpen)}
            />
          </Host>
        </View>
        {searchError && (
          <AppText accessibilityLiveRegion="polite">{searchError}</AppText>
        )}
        {applied.search && (
          <NativeActions>
            <NativeAction
              label="Clear search"
              tone="text"
              onPress={() => {
                setSearchError(null);
                setDraft((previous) => ({ ...previous, search: "" }));
                onChange({ ...applied, search: "" });
              }}
            />
          </NativeActions>
        )}
      </Panel>
      {filtersOpen && (
        <Panel>
          <NativeField
            label="Month filter"
            value={draft.month}
            onChangeText={(month) => setDraft({ ...draft, month })}
            placeholder="YYYY-MM"
            returnKeyType="done"
            onSubmitEditing={apply}
          />
          <AccountChoice
            label="Classification"
            value={draft.classification}
            options={classifications}
            labels={classificationLabels}
            onChange={(classification) =>
              setDraft({
                ...draft,
                classification: classification as ClassificationOption,
              })
            }
            disabled={false}
          />
          <Host matchContents={{ vertical: true }} colorScheme="light">
            <Switch
              label="Only uncategorized"
              value={draft.uncategorizedOnly}
              onValueChange={(uncategorizedOnly) =>
                setDraft({ ...draft, uncategorizedOnly })
              }
            />
          </Host>
          {filterError && (
            <AppText accessibilityLiveRegion="polite">{filterError}</AppText>
          )}
          <NativeActions>
            <NativeAction label="Apply activity filters" onPress={apply} />
            <NativeAction
              label="Clear activity filters"
              tone="secondary"
              onPress={() => {
                setFilterError(null);
                setDraft((previous) => ({
                  ...emptyActivityFilters,
                  search: previous.search,
                }));
                onChange({ ...emptyActivityFilters, search: applied.search });
                setFiltersOpen(false);
              }}
            />
          </NativeActions>
        </Panel>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.small,
  },
  searchInput: { flex: 1, minWidth: 0 },
  stacked: { flexDirection: "column", alignItems: "stretch" },
});
