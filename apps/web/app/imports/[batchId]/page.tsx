import { ImportDetail } from "../../../components/imports/detail";
export default async function Page({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  return <ImportDetail batchId={batchId} />;
}
