import { useEffect, useRef, useState } from "react";
import type { AccountResponse, MeResponse } from "@joint/contracts";
import * as expoRouter from "expo-router";
import { AppState, View } from "react-native";
import { AppText } from "@/components/app-text";
import { Feedback, IdentityFrame } from "@/components/identity-frame";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { spacing } from "@/theme/tokens";
import { NativeApiError, nativeErrorMessage } from "../../api/errors";
import { createPrivacyApi, type PrivacyApi } from "../../api/privacy";
import { useIdentity } from "../identity/context";
import { SessionActions } from "../identity/session-actions";
import { ArchiveActivity } from "./archive-activity";
import { ExportPanel } from "./export-panel";
import type { ExportFileRegistry } from "./export-file";

export function ArchiveScreen({
  me,
  onBack,
  onOpenPrivacy,
  onOpenSecurity,
  privacy: injectedPrivacy,
  files,
}: {
  me: MeResponse;
  onBack?: () => void;
  onOpenPrivacy?: () => void;
  onOpenSecurity?: () => void;
  privacy?: PrivacyApi;
  files?: ExportFileRegistry;
}): React.JSX.Element {
  const identity = useIdentity();
  const focused =
    typeof expoRouter.useIsFocused === "function"
      ? expoRouter.useIsFocused()
      : true;
  const privacy =
    injectedPrivacy ??
    identity.privacy ??
    createPrivacyApi(identity.finance.transport);
  const actor =
    identity.finance.getVerifiedIdentity()?.actor ??
    identity.finance.getActor?.() ??
    me.user.id;

  const [appActive, setAppActive] = useState(
    () => AppState.currentState === "active",
  );
  const active = appActive && focused;
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState("");
  const revision = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  async function load(next?: string) {
    const current = ++revision.current;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setLoading(true);
    setError("");
    if (!next) {
      setAccounts([]);
      setCursor(null);
    }
    try {
      const result = await privacy.listArchiveAccounts(
        { limit: 50, ...(next ? { cursor: next } : {}) },
        abort.signal,
      );
      if (current === revision.current && !abort.signal.aborted) {
        setAccounts((old) => (next ? [...old, ...result.items] : result.items));
        setCursor(result.nextCursor);
      }
    } catch (cause) {
      if (current === revision.current && !abort.signal.aborted) {
        if (cause instanceof NativeApiError && cause.status === 401) {
          identity.finance.revoke(actor);
          return;
        }
        setAccounts([]);
        setCursor(null);
        setSelected("");
        setError(nativeErrorMessage(cause));
      }
    } finally {
      if (current === revision.current && !abort.signal.aborted) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (active) {
      void load();
    } else {
      revision.current++;
      abortRef.current?.abort();
      setAccounts([]);
      setCursor(null);
      setSelected("");
      setError("");
      setLoading(false);
    }
    return () => {
      revision.current++;
      abortRef.current?.abort();
    };
  }, [active, actor]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppActive(state === "active");
    });
    return () => {
      subscription.remove();
    };
  }, []);

  const selectedAccount = accounts.find((item) => item.id === selected);

  return (
    <IdentityFrame
      title="Your owner archive."
      description="A quiet place for the accounts you own. Read and export only."
    >
      <Feedback error={error} />
      {me.membership && (
        <Panel>
          <AppText variant="title">Your household is active</AppText>
          <AppText>
            Your current accounts are available in your household. Accounts you
            legally owned in a former household remain in this read-only
            archive.
          </AppText>
          {onOpenPrivacy && (
            <NativeActions>
              <NativeAction
                label="Open privacy settings"
                tone="secondary"
                onPress={onOpenPrivacy}
              />
            </NativeActions>
          )}
        </Panel>
      )}
      <AppText tone="secondary">
        Read and export only. You can see your legally owned history. Former
        household grants no longer give access. This archive cannot edit, import
        or share.
      </AppText>
      <Panel>
        <View
          accessible={false}
          accessibilityLabel="Archived accounts"
          style={{ gap: spacing.small }}
        >
          <AppText variant="title">Archived accounts</AppText>
          <AppText tone="secondary">
            {accounts.length} loaded{" "}
            {accounts.length === 1 ? "account" : "accounts"} · Only accounts you
            own
          </AppText>
          {loading && (
            <AppText accessibilityLiveRegion="polite">
              Loading accounts…
            </AppText>
          )}
          {!loading && !error && accounts.length === 0 && (
            <AppText tone="secondary">
              No accounts owned by you are available in the archive.
            </AppText>
          )}
          {accounts.map((item) => (
            <NativeActions key={item.id}>
              <NativeAction
                label={`${item.label} · Read history`}
                tone={selected === item.id ? "primary" : "secondary"}
                disabled={loading}
                onPress={() => {
                  identity.interact();
                  setSelected(item.id);
                }}
              />
            </NativeActions>
          ))}
          {(cursor || error) && (
            <NativeActions>
              {cursor && (
                <NativeAction
                  label="Load more accounts"
                  tone="text"
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
      {active && selectedAccount ? (
        <ArchiveActivity
          key={selectedAccount.id}
          account={selectedAccount}
          actor={actor}
          active={active}
          privacy={privacy}
          onRevoke={(target) => identity.finance.revoke(target)}
        />
      ) : (
        <Panel>
          <AppText variant="title">Read your owned history</AppText>
          <AppText tone="secondary">
            Select an archived account to see its recorded value and
            transactions. This space cannot edit, import or share.
          </AppText>
        </Panel>
      )}
      <ExportPanel
        accounts={accounts}
        streamScope={{ kind: "archive-export" }}
        actor={actor}
        refreshing={loading}
        scopeError={Boolean(error)}
        active={active}
        privacy={privacy}
        transport={identity.finance.transport}
        onAccessChanged={() => void load()}
        onRevoke={(target) => identity.finance.revoke(target)}
        onOpenSecurity={() => {
          if (onOpenSecurity) onOpenSecurity();
          else identity.workflow.showSecurity(true, "archive");
        }}
        {...(files ? { files } : {})}
      />
      {onBack && (
        <NativeActions>
          <NativeAction
            label="Back to your account"
            tone="text"
            onPress={onBack}
          />
        </NativeActions>
      )}
      <SessionActions />
    </IdentityFrame>
  );
}
