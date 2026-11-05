import { useIdentity } from "@/features/identity/context";
import { AccountScreen } from "@/features/identity/account-screen";
export default function MoreScreen(): React.JSX.Element | null {
  const { state } = useIdentity();
  return state.kind === "ready" ? <AccountScreen me={state.me} /> : null;
}
