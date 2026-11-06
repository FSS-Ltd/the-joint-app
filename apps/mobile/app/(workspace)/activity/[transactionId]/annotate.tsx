import { AnnotationScreen } from "@/features/activity/annotation-screen";
import { TransactionRoute } from "@/features/activity/transaction-route";

export default function Page(): React.JSX.Element {
  return <TransactionRoute screen={AnnotationScreen} />;
}
