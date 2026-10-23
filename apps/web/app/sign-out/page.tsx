import { ClerkEntry } from "../../components/identity/auth-entry";
import { LogoutRecovery } from "../../components/identity/logout-completion";
export default function SignOutPage() {
  return (
    <ClerkEntry>
      <LogoutRecovery />
    </ClerkEntry>
  );
}
