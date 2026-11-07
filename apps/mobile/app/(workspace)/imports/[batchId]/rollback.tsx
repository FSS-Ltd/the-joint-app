import { RollbackScreen } from "@/features/imports/import-action-screen";
import { ImportBatchRoute } from "@/features/imports/import-routes";

export default function Page(): React.JSX.Element {
  return <ImportBatchRoute screen={RollbackScreen} />;
}
