import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { Screen } from "@/components/screen";
import { WriteFeedback, type WriteOutcome } from "../accounts/write-feedback";
import type { EntityWriteSession } from "./use-entity-write";

/** Shared states for every write: access, view-only, cleared draft, outcome. */
export function EntityWriteBoundary<E, D, R extends { id: string }>({
  session,
  title,
  header,
  viewOnly,
  retryLabel,
  reloadLabel = "Reload",
  backHref,
  backLabel,
  outcome,
  children,
}: {
  session: EntityWriteSession<E, D, R>;
  title: string;
  header?: (entity: E) => ReactNode;
  viewOnly: string;
  retryLabel: string;
  reloadLabel?: string;
  backHref: string;
  backLabel: string;
  outcome: WriteOutcome;
  children: ReactNode;
}): React.JSX.Element {
  const router = useRouter();
  const { read, draft, mutation } = session;
  let content: ReactNode;
  if (read.kind === "loading" || !draft.visible)
    content = (
      <AppText accessibilityLiveRegion="polite">Checking access…</AppText>
    );
  else if (read.kind === "error")
    content = (
      <>
        <AppText accessibilityLiveRegion="polite">{read.message}</AppText>
        <NativeActions>
          <NativeAction label={retryLabel} onPress={session.reload} />
        </NativeActions>
      </>
    );
  else if (!session.allowed || draft.invalidated)
    content = (
      <>
        <AppText>{viewOnly}</AppText>
        <NativeActions>
          <NativeAction
            label={backLabel}
            onPress={() => router.replace(backHref)}
          />
        </NativeActions>
      </>
    );
  else if (!draft.base)
    content = (
      <>
        <AppText accessibilityLiveRegion="polite">
          Your draft was cleared when the app left the foreground. Reload to
          start again.
        </AppText>
        <NativeActions>
          <NativeAction label={reloadLabel} onPress={session.reload} />
        </NativeActions>
      </>
    );
  else
    content = (
      <>
        {header?.(draft.base)}
        {mutation.kind !== "success" && children}
        {draft.message !== "" && (
          <AppText accessibilityLiveRegion="polite">{draft.message}</AppText>
        )}
        <WriteFeedback
          mutation={mutation}
          reload={session.reload}
          outcome={outcome}
        />
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
