import { TransactionDetail } from "../../../components/activity/detail";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const { transactionId } = await params;
  return <TransactionDetail transactionId={transactionId} />;
}
