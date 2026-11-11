import type { SpendingReport } from "@joint/contracts";
import { useNativeFinance } from "../finance/context";
import type { FinanceResourceResult } from "../finance/state";
import { useFinanceResource } from "../finance/use-resource";

export function useCurrentSpendingReport(): FinanceResourceResult<SpendingReport> {
  const finance = useNativeFinance();
  return useFinanceResource(
    {
      kind: "spending",
      householdId:
        finance.authority?.householdId ??
        "00000000-0000-4000-8000-000000000000",
    },
    (scope, signal) =>
      finance.spending.readReport(
        scope.householdId,
        "current",
        undefined,
        signal,
      ),
  );
}
