import { useState } from "react";
import {
  classificationKindSchema,
  monthSchema,
  transactionListQueryBase,
  type ClassificationKind,
} from "@joint/contracts";
import { Host, Switch } from "@expo/ui";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { NativeField } from "@/components/native-field";
import { Panel } from "@/components/panel";
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
        <NativeField
          label="Search transactions"
          value={draft.search}
          onChangeText={(search) => setDraft({ ...draft, search })}
          returnKeyType="search"
          onSubmitEditing={search}
        />
        {searchError && (
          <AppText accessibilityLiveRegion="polite">{searchError}</AppText>
        )}
        <NativeActions>
          <NativeAction
            label={
              filtersOpen
                ? "Hide filters"
                : filterCount
                  ? `Filters (${filterCount})`
                  : "Filters"
            }
            tone="secondary"
            onPress={() => setFiltersOpen(!filtersOpen)}
          />
          {applied.search && (
            <NativeAction
              label="Clear search"
              tone="text"
              onPress={() => {
                setSearchError(null);
                setDraft((previous) => ({ ...previous, search: "" }));
                onChange({ ...applied, search: "" });
              }}
            />
          )}
        </NativeActions>
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
