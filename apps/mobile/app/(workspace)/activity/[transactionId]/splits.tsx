import { SplitScreen } from "@/features/activity/split-screen";
import { TransactionRoute } from "@/features/activity/transaction-route";

export default function Page(): React.JSX.Element {
  return <TransactionRoute screen={SplitScreen} />;
}
