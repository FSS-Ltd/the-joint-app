import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { Screen } from "@/components/screen";
import { WriteFeedback } from "../accounts/write-feedback";
import type { ImportFlow } from "./use-import-flow";

/** Access, ownership, cleared-draft and outcome states for the upload flow. */
export function ImportBoundary({
  flow,
  children,
}: {
  flow: ImportFlow;
  children: ReactNode;
}): React.JSX.Element {
  const router = useRouter();
  const { resource, draft, mutation } = flow;
  let content: ReactNode;
  if (!draft.visible || (resource.kind === "loading" && !flow.preservingDraft))
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
  else if ((!flow.allowed && !flow.preservingDraft) || draft.invalidated)
    content = (
      <>
        <AppText>Only the account owner can import transactions.</AppText>
        <NativeActions>
          <NativeAction
            label="Choose another account"
            onPress={() => router.replace("/imports")}
          />
        </NativeActions>
      </>
    );
  else if (!draft.base)
    content = (
      <>
        <AppText accessibilityLiveRegion="polite">
          Your file was cleared when the app left the foreground. Reload to
          start again.
        </AppText>
        <NativeActions>
          <NativeAction label="Reload account" onPress={flow.reload} />
        </NativeActions>
      </>
    );
  else
    content = (
      <>
        {mutation.kind !== "success" && children}
        {draft.message !== "" && (
          <AppText accessibilityLiveRegion="polite">{draft.message}</AppText>
        )}
        {flow.preservingDraft ? (
          <AppText accessibilityLiveRegion="polite">
            Checking account access…
          </AppText>
        ) : (
          <WriteFeedback
            mutation={mutation}
            reload={flow.reload}
            outcome={{
              saved: "File uploaded. Open the import to follow its progress.",
              open: "Open import",
              openHref: (id) => `/imports/${id}`,
              pending: "Uploading your file…",
              check: "Check imports",
              checkHref: "/imports",
            }}
          />
        )}
      </>
    );
  return (
    <Screen>
      <Panel>
        <AppText variant="heading" accessibilityRole="header">
          Import transactions
        </AppText>
        {content}
      </Panel>
    </Screen>
  );
}
