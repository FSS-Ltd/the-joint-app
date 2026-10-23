import { TransactionDetail } from "../../../components/activity/detail";
export default async function Page({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const { transactionId } = await params;
  return <TransactionDetail transactionId={transactionId} />;
}
