import { AccountRoute } from "@/features/accounts/account-route";
import { EditAccountScreen } from "@/features/accounts/edit-screen";
export default function Page(): React.JSX.Element {
  return <AccountRoute screen={EditAccountScreen} />;
}
