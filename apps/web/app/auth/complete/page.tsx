import { ClerkEntry } from "../../../components/identity/auth-entry";
import { ClerkCompletion } from "../../../components/identity/clerk/completion";
export default function CompletionPage() {
  return (
    <ClerkEntry>
      <ClerkCompletion />
    </ClerkEntry>
  );
}
