import { RemoveTransferScreen } from "@/features/activity/remove-transfer-screen";
import { TransactionRoute } from "@/features/activity/transaction-route";

export default function Page(): React.JSX.Element {
  return <TransactionRoute screen={RemoveTransferScreen} />;
}
