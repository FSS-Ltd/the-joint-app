import { Imports } from "../../components/imports";
import { CutoverNoticeBanner } from "../../components/cutover/cutover-banner";

export default function ImportsPage() {
  return (
    <>
      <CutoverNoticeBanner routeName="Imports" />
      <Imports />
    </>
  );
}
