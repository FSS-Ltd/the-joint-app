import { ImportReviewScreen } from "@/features/imports/import-review-screen";
import { ImportBatchRoute } from "@/features/imports/import-routes";

export default function Page(): React.JSX.Element {
  return <ImportBatchRoute screen={ImportReviewScreen} />;
}
