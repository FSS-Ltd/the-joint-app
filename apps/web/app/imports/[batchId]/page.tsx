import { ImportDetail } from "../../../components/imports/detail";
import { CutoverNoticeBanner } from "../../../components/cutover/cutover-banner";

export default async function ImportDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  return (
    <>
      <CutoverNoticeBanner routeName="Import Batch" />
      <ImportDetail batchId={batchId} />
    </>
  );
}
