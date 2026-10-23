import { ClerkEntry } from "../../../../components/identity/auth-entry";
import { ClerkPasswordTask } from "../../../../components/identity/clerk/security";
export default function PasswordTaskPage() {
  return (
    <ClerkEntry>
      <ClerkPasswordTask />
    </ClerkEntry>
  );
}
