import type { ClassificationKind, StatusSubscription } from "@joint/contracts";
import type { ActivityQuery } from "../../api/transactions";

export type ActivityFilters = Pick<
  ActivityQuery,
  "month" | "search" | "classificationKind" | "uncategorized"
>;

export interface ActivityFilterDraft {
  readonly month: string;
  readonly search: string;
  readonly classification: "ALL" | ClassificationKind;
  readonly uncategorizedOnly: boolean;
}

export const emptyActivityFilters: ActivityFilterDraft = {
  month: "",
  search: "",
  classification: "ALL",
  uncategorizedOnly: false,
};

/** Empty controls are absent filters, never wildcard values on the wire. */
export function activityFilters(draft: ActivityFilterDraft): ActivityFilters {
  const search = draft.search.trim();
  return {
    ...(draft.month ? { month: draft.month } : {}),
    ...(search ? { search } : {}),
    ...(draft.classification !== "ALL"
      ? { classificationKind: draft.classification }
      : {}),
    ...(draft.uncategorizedOnly ? { uncategorized: true } : {}),
  };
}

export function activitySelector(
  householdId: string,
  accountId: string,
  cursor: string | undefined,
  filters: ActivityFilters,
  limit = 50,
): Extract<StatusSubscription, { kind: "transactions" }> {
  const { uncategorized, ...rest } = filters;
  return {
    kind: "transactions",
    householdId,
    accountId,
    limit,
    ...(cursor ? { cursor } : {}),
    ...rest,
    ...(uncategorized ? { uncategorized: "true" as const } : {}),
  };
}

export function activityQuery(
  selector: Extract<StatusSubscription, { kind: "transactions" }>,
): ActivityQuery {
  return {
    accountId: selector.accountId,
    limit: selector.limit,
    ...(selector.cursor ? { cursor: selector.cursor } : {}),
    ...(selector.month ? { month: selector.month } : {}),
    ...(selector.search ? { search: selector.search } : {}),
    ...(selector.classificationKind
      ? { classificationKind: selector.classificationKind }
      : {}),
    ...(selector.uncategorized
      ? { uncategorized: selector.uncategorized === "true" }
      : {}),
  };
}
