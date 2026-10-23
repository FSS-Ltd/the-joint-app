import { ClerkEntry } from "../../../components/identity/auth-entry";
import { ClerkCallback } from "../../../components/identity/clerk/completion";
export default function CallbackPage() {
  return (
    <ClerkEntry>
      <ClerkCallback />
    </ClerkEntry>
  );
}
