import { Household } from "../../components/identity/household";
import { CutoverNoticeBanner } from "../../components/cutover/cutover-banner";

export default function HouseholdPage() {
  return (
    <>
      <CutoverNoticeBanner routeName="Household Settings" />
      <Household />
    </>
  );
}
