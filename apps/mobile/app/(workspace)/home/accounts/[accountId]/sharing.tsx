import { AccountRoute } from "@/features/accounts/account-route";
import { SharingScreen } from "@/features/accounts/sharing-screen";
export default function Page(): React.JSX.Element {
  return <AccountRoute screen={SharingScreen} />;
}
