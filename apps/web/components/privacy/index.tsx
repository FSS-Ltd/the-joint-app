"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { EntitlementResponse } from "@joint/contracts";
import { AccountsFrame } from "../accounts/frame";
import { Feedback } from "../identity/frame";
import { errorMessage, request } from "../identity/client";
import { useIdentity } from "../identity/use-identity";
import { ExportPanel } from "./export-panel";
import { usePrivacyAccounts } from "./use-privacy-accounts";
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
        <div className="privacy-layout">
          <div className="privacy-stack">
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
            <PrivacyActions householdId={householdId} />
          </div>
          <aside className="privacy-stack">
            <section className="surface form-card">
              <p className="step-label">Your plan</p>
              <h2>
                {entitlements
                  ? entitlements.plan === "PLUS"
                    ? "Plus access"
                    : "Free essentials"
                  : "Privacy stays available"}
              </h2>
              <Feedback error={planError} />
              <p>
                Export, revoke sharing, leave and delete your account remain
                available on Free. Plan access never changes account ownership
                or sharing permission.
              </p>
              <p className="field-hint">
                Plus capabilities are entitlements only. Connected banking,
                advanced projections and automation are not available in this
                build.
              </p>
              <a href="/accounts">Manage account sharing</a>
            </section>
            <section className="surface form-card privacy-connections">
              <p className="step-label">Connections</p>
              <h2>No bank connections</h2>
              <p>
                Direct bank and broker connections are not available. Manual
                accounts and CSV imports do not create a bank authorisation.
              </p>
              <button className="button secondary" disabled>
                Disconnect bank · unavailable
              </button>
            </section>
          </aside>
        </div>
      )}
    </AccountsFrame>
  );
}
