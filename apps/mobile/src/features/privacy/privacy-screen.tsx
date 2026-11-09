import { useEffect, useRef, useState } from "react";
import type {
  AccountResponse,
  EntitlementResponse,
  MeResponse,
} from "@joint/contracts";
import * as expoRouter from "expo-router";
import { AppState } from "react-native";
import { AppText } from "@/components/app-text";
import { Feedback, IdentityFrame } from "@/components/identity-frame";
import { NativeAction } from "@/components/native-action";
import { NativeActions } from "@/components/native-actions";
import { Panel } from "@/components/panel";
import { createAccountsApi, type AccountsApi } from "../../api/accounts";
import { NativeApiError, nativeErrorMessage } from "../../api/errors";
import { createPrivacyApi, type PrivacyApi } from "../../api/privacy";
import { useIdentity } from "../identity/context";
import { SessionActions } from "../identity/session-actions";
import type { ExportFileRegistry } from "./export-file";
import { ExportPanel } from "./export-panel";
import { PrivacyActions } from "./privacy-actions";
import { PrivacyContextCard } from "./privacy-context-card";

export function PrivacyScreen({
  me,
  onBack,
  onOpenArchive,
  onOpenSecurity,
  onOpenAccounts,
  privacy: injectedPrivacy,
  accountsApi: injectedAccountsApi,
  files,
}: {
  me: MeResponse;
  onBack?: () => void;
  onOpenArchive?: () => void;
  onOpenSecurity?: () => void;
  onOpenAccounts?: () => void;
  privacy?: PrivacyApi;
  accountsApi?: AccountsApi;
  files?: ExportFileRegistry;
}): React.JSX.Element {
  const identity = useIdentity();
  const router = expoRouter.useRouter();
  const focused =
    typeof expoRouter.useIsFocused === "function"
      ? expoRouter.useIsFocused()
      : true;
  const privacy =
    injectedPrivacy ??
    identity.privacy ??
    createPrivacyApi(identity.finance.transport);
  const accountsApi =
    injectedAccountsApi ?? createAccountsApi(identity.finance.transport);
  const householdId = me.membership?.householdId;
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
  const [listError, setListError] = useState("");
  const [loading, setLoading] = useState(false);
  const [entitlements, setEntitlements] = useState<EntitlementResponse | null>(
    null,
  );
  const [planError, setPlanError] = useState("");
  const revision = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const planAbortRef = useRef<AbortController | null>(null);

  async function loadAccounts(next?: string) {
    if (!householdId) return;
    const current = ++revision.current;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setLoading(true);
    setListError("");
    if (!next) {
      setAccounts([]);
      setCursor(null);
    }
    try {
      const result = await accountsApi.list(
        householdId,
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
        setListError(nativeErrorMessage(cause));
      }
    } finally {
      if (current === revision.current && !abort.signal.aborted) {
        setLoading(false);
      }
    }
  }

  async function loadPlan() {
    if (!householdId) {
      setEntitlements(null);
      setPlanError("");
      return;
    }
    planAbortRef.current?.abort();
    const abort = new AbortController();
    planAbortRef.current = abort;
    setEntitlements(null);
    setPlanError("");
    try {
      const result = await privacy.readEntitlements(householdId, abort.signal);
      if (!abort.signal.aborted) {
        setEntitlements(result);
      }
    } catch (cause) {
      if (!abort.signal.aborted) {
        if (cause instanceof NativeApiError && cause.status === 401) {
          identity.finance.revoke(actor);
          return;
        }
        setPlanError(nativeErrorMessage(cause));
      }
    }
  }

  useEffect(() => {
    if (active) {
      void loadAccounts();
      void loadPlan();
    } else {
      revision.current++;
      abortRef.current?.abort();
      planAbortRef.current?.abort();
      setAccounts([]);
      setCursor(null);
      setListError("");
      setLoading(false);
      setEntitlements(null);
      setPlanError("");
    }
    return () => {
      revision.current++;
      abortRef.current?.abort();
      planAbortRef.current?.abort();
    };
  }, [active, householdId, actor]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppActive(state === "active");
    });
    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <IdentityFrame
      title="Your data. Your choice."
      description="Keep a copy, manage your access, or leave on your own terms."
    >
      <Feedback error={listError} />
      {loading && (
        <AppText accessibilityLiveRegion="polite">
          Loading privacy settings…
        </AppText>
      )}
      {listError && (
        <NativeActions>
          <NativeAction
            label="Try again"
            tone="secondary"
            disabled={loading}
            onPress={() => {
              void identity.refresh();
              void loadAccounts();
              void loadPlan();
            }}
          />
        </NativeActions>
      )}
      {householdId ? (
        <>
          <ExportPanel
            accounts={accounts}
            streamScope={{ kind: "export", householdId }}
            actor={actor}
            refreshing={loading}
            scopeError={Boolean(listError)}
            active={active}
            privacy={privacy}
            transport={identity.finance.transport}
            onAccessChanged={() => void loadAccounts()}
            onRevoke={(target) => identity.finance.revoke(target)}
            onOpenSecurity={() => {
              if (onOpenSecurity) onOpenSecurity();
              else identity.workflow.showSecurity(true, "privacy");
            }}
            {...(files ? { files } : {})}
          />
          {cursor && (
            <NativeActions>
              <NativeAction
                label="Load more accounts"
                tone="secondary"
                disabled={loading}
                onPress={() => void loadAccounts(cursor)}
              />
            </NativeActions>
          )}
        </>
      ) : (
        <Panel>
          <AppText variant="title">Your owner archive</AppText>
          <AppText>
            After leaving, accounts you legally own remain available to read and
            export. Shared access has ended.
          </AppText>
          <NativeActions>
            <NativeAction
              label="Open owner archive"
              onPress={() => {
                if (onOpenArchive) onOpenArchive();
                else identity.workflow.showView("archive");
              }}
            />
          </NativeActions>
        </Panel>
      )}
      <PrivacyContextCard
        entitlements={entitlements}
        error={planError}
        {...(householdId
          ? {
              onOpenAccounts:
                onOpenAccounts ?? (() => router.push("/home/accounts")),
            }
          : {})}
      />
      {householdId && (
        <Panel>
          <AppText variant="title">Your owner archive</AppText>
          <AppText>
            Accounts you legally owned in a former household remain available to
            read and export in your owner archive.
          </AppText>
          <NativeActions>
            <NativeAction
              label="Open owner archive"
              tone="secondary"
              onPress={() => {
                if (onOpenArchive) onOpenArchive();
                else identity.workflow.showView("archive");
              }}
            />
          </NativeActions>
        </Panel>
      )}
      <PrivacyActions
        {...(householdId ? { householdId } : {})}
        actor={actor}
        active={active}
        privacy={privacy}
        onOpenSecurity={() => {
          if (onOpenSecurity) onOpenSecurity();
          else identity.workflow.showSecurity(true, "privacy");
        }}
        onRevoke={(target) => identity.finance.revoke(target)}
        onEndSession={(notice) =>
          identity.endRevokedSession
            ? identity.endRevokedSession(notice)
            : identity.logout("local")
        }
        onDeletionReceipt={(receipt) =>
          identity.workflow.setDeletionReceipt(receipt)
        }
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
