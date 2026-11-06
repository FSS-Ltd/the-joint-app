import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { Screen } from "@/components/screen";
import { WriteFeedback } from "../accounts/write-feedback";
import type { TransactionWriteSession } from "./use-transaction-write";

/** Shared states for every transaction write: access, view-only, cleared draft, outcome. */
export function TransactionWriteBoundary<D>({
  session,
  transactionId,
  title,
  children,
}: {
  session: TransactionWriteSession<D>;
  transactionId: string;
  title: string;
  children: ReactNode;
}): React.JSX.Element {
  const router = useRouter();
  const { read, draft, mutation } = session;
  const detail = `/activity/${transactionId}`;
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
          <NativeAction
            label="Retry transaction access"
            onPress={session.reload}
          />
        </NativeActions>
      </>
    );
  else if (!session.allowed || draft.invalidated)
    content = (
      <>
        <AppText>You cannot make this change to this transaction.</AppText>
        <NativeActions>
          <NativeAction
            label="Back to transaction"
            onPress={() => router.replace(detail)}
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
          <NativeAction label="Reload transaction" onPress={session.reload} />
        </NativeActions>
      </>
    );
  else
    content = (
      <>
        <AppText tone="secondary">
          {draft.base.description} · {formatAggregateMoney(draft.base.money)}
        </AppText>
        {mutation.kind !== "success" && children}
        {draft.message !== "" && (
          <AppText accessibilityLiveRegion="polite">{draft.message}</AppText>
        )}
        <WriteFeedback
          mutation={mutation}
          reload={session.reload}
          outcome={{
            saved: "Saved. Open the transaction to review its latest details.",
            open: "Back to transaction",
            openHref: () => detail,
            check: "Check transaction",
            checkHref: detail,
          }}
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
