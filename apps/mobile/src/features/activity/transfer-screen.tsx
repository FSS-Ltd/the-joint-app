import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { AppText } from "@/components/app-text";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { AccountChoice } from "../accounts/account-choice";
import { TransactionWriteBoundary } from "./transaction-write-boundary";
import { useTransferCandidates } from "./use-transfer-candidates";
import { useTransferLinkWrite } from "./use-transfer-write";

export function TransferScreen({
  transactionId,
}: {
  transactionId: string;
}): React.JSX.Element {
  const session = useTransferLinkWrite(transactionId);
  const { draft, mutation, editable } = session;
  const base = draft.base;
  const found = useTransferCandidates(base);
  const accountLabels: Record<string, string> = {
    "": "Choose an owned account",
  };
  if (found.accounts.kind === "ready")
    for (const item of found.accounts.items)
      accountLabels[item.id] = item.label;
  const entryLabels: Record<string, string> = {
    "": "Choose the opposite booked entry",
  };
  if (found.entries.kind === "ready")
    for (const item of found.entries.items)
      entryLabels[item.id] =
        `${item.bookedDate} · ${item.description} · ${formatAggregateMoney(item.money)}`;
  // A picked entry stays selectable even if a refreshed page no longer lists it.
  const picked = draft.value.counterpart;
  const entryIds =
    found.entries.kind === "ready" ? found.entries.items.map((i) => i.id) : [];
  if (picked && !entryIds.includes(picked.id)) {
    entryIds.push(picked.id);
    entryLabels[picked.id] =
      `${picked.bookedDate} · ${picked.description} · ${formatAggregateMoney(picked.money)}`;
  }
  return (
    <TransactionWriteBoundary
      session={session}
      transactionId={transactionId}
      title="Link a transfer"
    >
      {base && (
        <>
          <AppText>
            Pair equal and opposite entries between two accounts you own. This
            records a relationship; it never moves money.
          </AppText>
          {found.accounts.kind === "loading" && (
            <AppText accessibilityLiveRegion="polite">
              Loading your accounts…
            </AppText>
          )}
          {found.accounts.kind === "error" && (
            <>
              <AppText accessibilityLiveRegion="polite">
                {found.accounts.message}
              </AppText>
              <NativeActions>
                <NativeAction label="Retry accounts" onPress={found.retry} />
              </NativeActions>
            </>
          )}
          {found.accounts.kind === "ready" &&
            (found.accounts.items.length === 0 ? (
              <AppText>
                You need another account that you own to pair this entry with.
              </AppText>
            ) : (
              <>
                <AccountChoice
                  label="Other account"
                  value={found.accountId}
                  options={["", ...found.accounts.items.map((i) => i.id)]}
                  labels={accountLabels}
                  onChange={(accountId) => {
                    found.choose(accountId);
                    draft.change({ counterpart: null });
                  }}
                  disabled={!editable}
                />
                {found.accounts.cursor && (
                  <AppText tone="secondary">
                    Showing your first 50 accounts.
                  </AppText>
                )}
              </>
            ))}
          {found.accountId !== "" && found.entries.kind === "loading" && (
            <AppText accessibilityLiveRegion="polite">
              Loading matching entries…
            </AppText>
          )}
          {found.accountId !== "" && found.entries.kind === "error" && (
            <>
              <AppText accessibilityLiveRegion="polite">
                {found.entries.message}
              </AppText>
              <NativeActions>
                <NativeAction
                  label="Retry entries"
                  onPress={found.retryEntries}
                />
              </NativeActions>
            </>
          )}
          {found.accountId !== "" && found.entries.kind === "ready" && (
            <>
              {entryIds.length === 0 ? (
                <AppText accessibilityLiveRegion="polite">
                  No matching entries on the pages loaded so far.
                </AppText>
              ) : (
                <AccountChoice
                  label="Matching entry"
                  value={draft.value.counterpart?.id ?? ""}
                  options={["", ...entryIds]}
                  labels={entryLabels}
                  onChange={(id) =>
                    draft.change({
                      counterpart:
                        found.entries.kind === "ready"
                          ? (found.entries.items.find((i) => i.id === id) ??
                            null)
                          : null,
                    })
                  }
                  disabled={!editable}
                />
              )}
              {found.entries.cursor && (
                <NativeActions>
                  <NativeAction
                    label="Load more matching activity"
                    tone="secondary"
                    disabled={!editable}
                    pending={found.moreLoading}
                    onPress={found.loadMore}
                  />
                </NativeActions>
              )}
            </>
          )}
          <NativeActions>
            <NativeAction
              label="Confirm transfer pair"
              disabled={!editable || draft.value.counterpart === null}
              pending={mutation.kind === "pending"}
              onPress={() => void session.submit()}
            />
          </NativeActions>
        </>
      )}
    </TransactionWriteBoundary>
  );
}
