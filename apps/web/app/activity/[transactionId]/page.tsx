import { TransactionDetail } from "../../../components/activity/detail";
import { CutoverNoticeBanner } from "../../../components/cutover/cutover-banner";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const { transactionId } = await params;
  return (
    <>
      <CutoverNoticeBanner routeName="Transaction Details" />
      <TransactionDetail transactionId={transactionId} />
    </>
  );
}
