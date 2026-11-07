import { TransactionRoute } from "@/features/activity/transaction-route";
import { TransferScreen } from "@/features/activity/transfer-screen";

export default function Page(): React.JSX.Element {
  return <TransactionRoute screen={TransferScreen} />;
}
