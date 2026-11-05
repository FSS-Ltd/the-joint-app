import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { Screen } from "@/components/screen";
import type { AccountWriteSession } from "./write-state";
import { WriteFeedback } from "./write-feedback";
export function WriteBoundary<T>({
  session,
  title,
  children,
}: {
  session: AccountWriteSession<T>;
  title: string;
  children: ReactNode;
}): React.JSX.Element {
  const router = useRouter();
  const { resource, draft, mutation } = session;
  let content: ReactNode;
  if (!draft.visible || resource.kind === "loading")
    content = (
      <AppText accessibilityLiveRegion="polite">
        Checking account access…
      </AppText>
    );
  else if (resource.kind === "error")
    content = (
      <>
        <AppText accessibilityLiveRegion="polite">{resource.message}</AppText>
        <NativeActions>
          <NativeAction label="Retry account access" onPress={resource.retry} />
        </NativeActions>
      </>
    );
  else if (!session.allowed)
    content = (
      <>
        <AppText>Only the account owner can make this change.</AppText>
        <NativeActions>
          <NativeAction
            label="Open accounts"
            onPress={() => router.replace("/home/accounts")}
          />
        </NativeActions>
      </>
    );
  else if (draft.invalidated)
    content = (
      <>
        <AppText>
          Account access changed. Reload before starting a new draft.
        </AppText>
        <NativeActions>
          <NativeAction
            label="Reload account access"
            onPress={session.reload}
          />
        </NativeActions>
      </>
    );
  else
    content = (
      <>
        {session.stale && mutation.kind !== "success" && (
          <>
            <AppText accessibilityLiveRegion="polite">
              {mutation.kind === "pending" || mutation.kind === "uncertain"
                ? "Account details changed. Your submitted request keeps its original values. Check its outcome before starting another change."
                : "This account changed while you were editing. Your draft is preserved. Discard it and reload before confirming a new change."}
            </AppText>
            {mutation.kind !== "pending" && mutation.kind !== "uncertain" && (
              <NativeActions>
                <NativeAction
                  label="Discard draft and reload"
                  onPress={session.reload}
                />
              </NativeActions>
            )}
          </>
        )}
        {draft.base && mutation.kind !== "success" && children}
        {draft.message !== "" && (
          <AppText accessibilityLiveRegion="polite">{draft.message}</AppText>
        )}
        <WriteFeedback mutation={mutation} reload={session.reload} />
      </>
    );
  return (
    <Screen>
      <Panel>
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
        {content}
      </Panel>
    </Screen>
  );
}
