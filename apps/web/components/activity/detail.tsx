"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { TransactionResponse } from "@joint/contracts";
import { useIdentity } from "../identity/use-identity";
import { request, errorMessage } from "../identity/client";
import { Feedback } from "../identity/frame";
import { AccountsFrame } from "../accounts/frame";
import { financePath } from "../finance/http";
import { EntryForm } from "./entry-form";
import { ClassificationForm, PrivateNoteForm } from "./annotations";
import "../finance/finance.css";
import "../spending/spending.css";
import { TransactionSourceSummary } from "./source-summary";
import "./activity.css";
import { SplitSummary } from "./split-summary";
import { SplitForm } from "./split-form";
import { TransferForm } from "./transfer-form";

export function TransactionDetail({
  transactionId,
}: {
  transactionId: string;
}): ReactNode {
  const { identity, loading, error: identityError } = useIdentity();
  const householdId = identity?.membership?.householdId;
  const [transaction, setTransaction] = useState<TransactionResponse | null>(
    null,
  );
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!householdId) return;
    let current = true;
    setTransaction(null);
    setError("");
    void request<TransactionResponse>(
      financePath(householdId, "transactions", transactionId),
    )
      .then((result) => {
        if (current) setTransaction(result);
      })
      .catch((cause) => {
        if (current) setError(errorMessage(cause));
      });
    return () => {
      current = false;
    };
  }, [householdId, transactionId, revision]);
  useEffect(() => {
    const focus = () => {
      setTransaction(null);
      setRevision((value) => value + 1);
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, []);
  function unavailable() {
    setTransaction(null);
    setRevision((value) => value + 1);
  }
  return (
    <AccountsFrame
      active="activity"
      title="Transaction details"
      description="The source record, your classification and a space only you can see."
      household={identity?.membership?.household.name}
    >
      <a
        className="form-link account-back"
        href={
          transaction
            ? `/activity?account=${transaction.accountId}`
            : "/activity"
        }
      >
        Back to activity
      </a>
      <Feedback error={identityError || error} />
      {(loading || (householdId && !transaction && !error)) && (
        <p role="status">Loading transaction…</p>
      )}
      {identity && !loading && !householdId && (
        <a className="button secondary" href="/household">
          Go to household
        </a>
      )}
      {error && (
        <button
          className="button secondary"
          type="button"
          onClick={() => setRevision((value) => value + 1)}
        >
          Reload transaction
        </button>
      )}
      {transaction && householdId && !identityError && (
        <div className="finance-stack activity-workspace">
          <TransactionSourceSummary
            transaction={transaction}
            reload={() => setRevision((value) => value + 1)}
          />
          <SplitSummary transaction={transaction} />
          <div className="finance-grid">
            <div className="finance-stack">
              {transaction.permissions.canCorrect &&
                !transaction.transfer?.confirmed &&
                !transaction.splits.length && (
                  <EntryForm
                    key={transaction.id}
                    householdId={householdId}
                    accountId={transaction.accountId}
                    transaction={transaction}
                    saved={setTransaction}
                    unavailable={unavailable}
                  />
                )}
              {transaction.permissions.canClassify && (
                <ClassificationForm
                  householdId={householdId}
                  transaction={transaction}
                  saved={setTransaction}
                  unavailable={unavailable}
                />
              )}
              {transaction.permissions.canNote && (
                <PrivateNoteForm
                  householdId={householdId}
                  transaction={transaction}
                  saved={setTransaction}
                  unavailable={unavailable}
                />
              )}
            </div>
            {transaction.permissions.canClassify && (
              <div className="finance-stack">
                {!transaction.transfer?.confirmed && (
                  <SplitForm
                    key={`${transaction.id}:${transaction.version}`}
                    householdId={householdId}
                    transaction={transaction}
                    saved={setTransaction}
                    unavailable={unavailable}
                  />
                )}
                <TransferForm
                  householdId={householdId}
                  transaction={transaction}
                  saved={setTransaction}
                  unavailable={unavailable}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </AccountsFrame>
  );
}
