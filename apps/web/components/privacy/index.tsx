"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { EntitlementResponse } from "@joint/contracts";
import { AccountsFrame } from "../accounts/frame";
import { Feedback } from "../identity/frame";
import { errorMessage, request } from "../identity/client";
import { useIdentity } from "../identity/use-identity";
import { ExportPanel } from "./export-panel";
import { usePrivacyAccounts } from "./use-privacy-accounts";
import { PrivacyContext } from "./privacy-context";
import { PrivacyActions } from "./privacy-actions";
import "./privacy.css";

export function Privacy(): ReactNode {
  const { identity, loading, error, refresh } = useIdentity();
  const householdId = identity?.membership?.householdId;
  const list = usePrivacyAccounts(
    householdId ? `/api/households/${householdId}/accounts` : null,
  );
  const [entitlements, setEntitlements] = useState<EntitlementResponse | null>(
    null,
  );
  const [planError, setPlanError] = useState("");
  useEffect(() => {
    let current = true;
    setEntitlements(null);
    setPlanError("");
    if (householdId)
      void request<EntitlementResponse>(
        `/api/households/${householdId}/entitlements`,
      )
        .then((value) => {
          if (current) setEntitlements(value);
        })
        .catch((cause) => {
          if (current) setPlanError(errorMessage(cause));
        });
    return () => {
      current = false;
    };
  }, [householdId]);
  return (
    <AccountsFrame
      title="Your data. Your choice."
      description="Keep a copy, manage your access, or leave on your own terms."
      household={identity?.membership?.household.name}
      active="privacy"
    >
      <Feedback error={error || list.error} />
      {loading && <p role="status">Loading privacy settings…</p>}
      {(error || list.error) && (
        <button
          className="button secondary"
          onClick={() => {
            void refresh();
            void list.load();
          }}
        >
          Try again
        </button>
      )}
      {identity && (
        <div className="privacy-workspace privacy-layout">
          <div className="privacy-stack privacy-export-area">
            {householdId ? (
              <>
                <ExportPanel
                  accounts={list.accounts}
                  path={`/api/households/${householdId}/exports`}
                  refreshing={list.loading}
                  scopeError={Boolean(list.error)}
                  actor={identity.user.id}
                  onAccessChanged={() => void list.load()}
                />
                {list.cursor && (
                  <button
                    className="button secondary"
                    disabled={list.loading}
                    onClick={() => void list.load(list.cursor ?? undefined)}
                  >
                    Load more accounts
                  </button>
                )}
              </>
            ) : (
              <section className="surface form-card">
                <h2>Your owner archive</h2>
                <p>
                  After leaving, accounts you legally own remain available to
                  read and export. Shared access has ended.
                </p>
                <a className="button primary" href="/archive">
                  Open owner archive
                </a>
              </section>
            )}
          </div>
          <PrivacyContext entitlements={entitlements} error={planError} />
          <div className="privacy-actions-area">
            <PrivacyActions householdId={householdId} />
          </div>
        </div>
      )}
    </AccountsFrame>
  );
}
