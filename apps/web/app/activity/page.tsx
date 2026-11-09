import { Activity } from "../../components/activity";
import { CutoverNoticeBanner } from "../../components/cutover/cutover-banner";

export default function ActivityPage() {
  return (
    <>
      <CutoverNoticeBanner routeName="Activity" />
      <Activity />
    </>
  );
}
