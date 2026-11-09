import { SpendingScreen } from "../../components/spending";
import { CutoverNoticeBanner } from "../../components/cutover/cutover-banner";

export default function DashboardPage() {
  return (
    <>
      <CutoverNoticeBanner routeName="Dashboard" />
      <SpendingScreen mode="dashboard" />
    </>
  );
}
