import { useEffect, useRef, useState } from "react";
import type { AccountResponse, TransactionResponse } from "@joint/contracts";
import { formatMoney } from "@joint/domain";
import { formatAggregateMoney } from "@joint/domain/cash-flow";
import { View } from "react-native";
import { AppText } from "@/components/app-text";
import { Feedback } from "@/components/identity-frame";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { spacing } from "@/theme/tokens";
import { NativeApiError, nativeErrorMessage } from "../../api/errors";
import type { PrivacyApi } from "../../api/privacy";
import { displayDate, kinds, ownerLabel } from "../accounts/account-labels";

export function ArchiveActivity({
  account,
  actor,
  active,
  privacy,
  onRevoke,
}: {
  account: AccountResponse;
  actor: string;
  active: boolean;
  privacy: PrivacyApi;
  onRevoke: (actor: string) => void;
}): React.JSX.Element {
  const [items, setItems] = useState<TransactionResponse[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const revision = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  async function load(next?: string) {
    if (!active) return;
    const current = ++revision.current;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setLoading(true);
    setError("");
    if (!next) {
      setItems([]);
      setCursor(null);
    }
    try {
      const result = await privacy.listArchiveTransactions(
        account.id,
        { limit: 50, ...(next ? { cursor: next } : {}) },
        abort.signal,
      );
      if (current === revision.current && !abort.signal.aborted) {
        setItems((old) => (next ? [...old, ...result.items] : result.items));
        setCursor(result.nextCursor);
      }
    } catch (cause) {
      if (current === revision.current && !abort.signal.aborted) {
        if (cause instanceof NativeApiError && cause.status === 401) {
          onRevoke(actor);
          return;
        }
        if (!next) {
          setItems([]);
          setCursor(null);
        }
        setError(nativeErrorMessage(cause));
      }
    } finally {
      if (current === revision.current && !abort.signal.aborted) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!active) {
      revision.current++;
      abortRef.current?.abort();
      setItems([]);
      setCursor(null);
      setError("");
      setLoading(false);
      return;
    }
    void load();
    return () => {
      revision.current++;
      abortRef.current?.abort();
    };
  }, [account.id, actor, active]);

  return (
    <Panel>
      <View
        accessible={false}
        accessibilityLabel="Archived history"
        style={{ gap: spacing.small }}
      >
        <AppText tone="secondary">Read only</AppText>
        <AppText variant="title">{account.label}</AppText>
        <AppText tone="secondary">
          {kinds[account.kind]} · {ownerLabel(account)}
        </AppText>
        <AppText
          variant="heading"
          style={{ fontVariant: ["tabular-nums"], fontSize: 28 }}
        >
          {account.latestValuation
            ? formatMoney(account.latestValuation.money)
            : "No recorded balance"}
        </AppText>
        <AppText tone="secondary">
          {account.latestValuation
            ? `As of ${displayDate(account.latestValuation.asOfDate)} · ${
                account.latestValuation.complete
                  ? "Complete recorded value"
                  : "Partial recorded value"
              }. Recorded value, not a current bank balance.`
            : "Recorded value, not a current bank balance."}
        </AppText>
        <Feedback error={error} />
        {loading && (
          <AppText accessibilityLiveRegion="polite">
            Loading archived history…
          </AppText>
        )}
        {!loading && !error && items.length === 0 && (
          <AppText tone="secondary">No archived transactions.</AppText>
        )}
        {items.map((item) => (
          <View key={item.id} style={{ gap: spacing.small / 2 }}>
            <AppText variant="title">{item.description}</AppText>
            <AppText
              style={{ fontVariant: ["tabular-nums"], fontWeight: "600" }}
            >
              {formatAggregateMoney(item.money)}
            </AppText>
            <AppText tone="secondary">
              {displayDate(item.bookedDate)} ·{" "}
              {item.source === "CSV" ? "CSV import" : "Manual record"}
            </AppText>
            {item.note.body && (
              <AppText tone="secondary">Your note: {item.note.body}</AppText>
            )}
          </View>
        ))}
        {(cursor || error) && (
          <NativeActions>
            {cursor && (
              <NativeAction
                label="Load more history"
                tone="secondary"
                disabled={loading}
                onPress={() => void load(cursor)}
              />
            )}
            {error && (
              <NativeAction
                label="Try again"
                tone="secondary"
                disabled={loading}
                onPress={() => void load()}
              />
            )}
          </NativeActions>
        )}
      </View>
    </Panel>
  );
}
