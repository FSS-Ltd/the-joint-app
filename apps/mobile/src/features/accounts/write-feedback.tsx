import { useRouter } from "expo-router";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { useIdentity } from "../identity/context";
import type { FinanceMutationResult } from "../finance/state";
export interface WriteOutcome {
  saved: string;
  open: string;
  openHref(id: string): string;
  check: string;
  checkHref: string;
}
const accountOutcome: WriteOutcome = {
  saved: "Saved. Open the account to review its latest details.",
  open: "Open saved account",
  openHref: (id) => `/home/accounts/${id}`,
  check: "Check account list",
  checkHref: "/home/accounts",
};
export function WriteFeedback<T extends { id: string }>({
  mutation,
  reload,
  outcome = accountOutcome,
}: {
  mutation: FinanceMutationResult<T>;
  reload(): void;
  outcome?: WriteOutcome;
}): React.JSX.Element | null {
  const router = useRouter(),
    identity = useIdentity();
  if (mutation.kind === "idle") return null;
  if (mutation.kind === "pending")
    return (
      <AppText accessibilityLiveRegion="polite">Saving your change…</AppText>
    );
  if (mutation.kind === "success")
    return (
      <>
        <AppText accessibilityLiveRegion="polite">{outcome.saved}</AppText>
        <NativeActions>
          <NativeAction
            label={outcome.open}
            onPress={() => router.replace(outcome.openHref(mutation.value.id))}
          />
        </NativeActions>
      </>
    );
  return (
    <>
      <AppText accessibilityLiveRegion="polite">{mutation.message}</AppText>
      <NativeActions>
        {mutation.recovery === "security" ? (
          <NativeAction
            label="Verify authenticator"
            onPress={() => {
              // Discard the pre-MFA draft and re-read before another submission.
              reload();
              identity.workflow.showSecurity(true);
              router.push("/more");
            }}
          />
        ) : mutation.recovery === "reload" ? (
          <NativeAction label="Discard draft and reload" onPress={reload} />
        ) : (
          <NativeAction
            label="Retry the same request"
            onPress={() => void mutation.retry()}
          />
        )}
        {mutation.kind === "error" && mutation.recovery === "retry" && (
          <NativeAction
            label="Discard draft and reload"
            tone="secondary"
            onPress={reload}
          />
        )}
        {mutation.kind === "uncertain" && (
          <NativeAction
            label={outcome.check}
            tone="secondary"
            onPress={() => router.replace(outcome.checkHref)}
          />
        )}
      </NativeActions>
    </>
  );
}
