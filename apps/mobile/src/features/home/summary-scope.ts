import { scopeAccountIdsSchema } from "@joint/contracts";
export type SummaryScope =
  { kind: "visible" } | { kind: "selected"; accountIds: string[] };
export function selectedSummaryScope(ids: readonly string[]): SummaryScope {
  return { kind: "selected", accountIds: scopeAccountIdsSchema.parse(ids) };
}
