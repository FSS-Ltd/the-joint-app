import { useNativeFinance } from "../finance/context";
import { useFinanceResource } from "../finance/use-resource";

/** One batch, refreshed only by committed `import` status changes; never polled. */
export function useImportBatch(batchId: string) {
  const finance = useNativeFinance();
  return useFinanceResource(
    {
      kind: "import",
      householdId:
        finance.authority?.householdId ??
        "00000000-0000-4000-8000-000000000000",
      id: batchId,
    },
    (scope, signal) => finance.imports.read(scope.householdId, batchId, signal),
  );
}
