import { SpendingScreen } from "../../components/spending";
import { CutoverNoticeBanner } from "../../components/cutover/cutover-banner";

export default function BudgetsPage() {
  return (
    <>
      <CutoverNoticeBanner routeName="Budgets" />
      <SpendingScreen mode="budgets" />
    </>
  );
}
