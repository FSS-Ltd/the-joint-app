import { SpendingScreen } from "../../components/spending";
import { CutoverNoticeBanner } from "../../components/cutover/cutover-banner";

export default function ReviewPage() {
  return (
    <>
      <CutoverNoticeBanner routeName="Review" />
      <SpendingScreen mode="review" />
    </>
  );
}
