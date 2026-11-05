import type { AccountResponse } from "@joint/contracts";
import { useRouter } from "expo-router";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { useIdentity } from "../identity/context";
import type { FinanceMutationResult } from "../finance/state";
export function WriteFeedback({
  mutation,
  reload,
}: {
  mutation: FinanceMutationResult<AccountResponse>;
  reload(): void;
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
        <AppText accessibilityLiveRegion="polite">
          Saved. Open the account to review its latest details.
        </AppText>
        <NativeActions>
          <NativeAction
            label="Open saved account"
            onPress={() =>
              router.replace(`/home/accounts/${mutation.value.id}`)
            }
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
              mutation.reset();
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
            label="Check account list"
            tone="secondary"
            onPress={() => router.replace("/home/accounts")}
          />
        )}
      </NativeActions>
    </>
  );
}
