import { AccountRoute } from "@/features/accounts/account-route";
import { ValuationScreen } from "@/features/accounts/valuation-screen";
export default function Page(): React.JSX.Element {
  return <AccountRoute screen={ValuationScreen} />;
}
