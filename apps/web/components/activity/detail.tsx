"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { TransactionResponse } from "@joint/contracts";
import { formatMoney } from "@joint/domain";
import { useIdentity } from "../identity/use-identity";
import { request, errorMessage } from "../identity/client";
import { Feedback } from "../identity/frame";
import { AccountsFrame } from "../accounts/frame";
import { displayDate } from "../accounts/presentation";
import { financePath } from "../finance/http";
import { EntryForm } from "./entry-form";
import { ClassificationForm, PrivateNoteForm } from "./annotations";
import "../finance/finance.css";

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
      {transaction && householdId && (
        <div className="finance-stack">
          <section className="surface form-card">
            <p className="step-label">
              {transaction.source === "CSV" ? "CSV import" : "Manual entry"} ·
              Booked {displayDate(transaction.bookedDate)}
            </p>
            <h2>{transaction.description}</h2>
            <button
              className="text-button"
              type="button"
              onClick={() => setRevision((value) => value + 1)}
            >
              Reload transaction
            </button>
            <p className="transaction-value">
              {formatMoney(transaction.money)}
            </p>
            <p>
              {[transaction.category, transaction.merchant]
                .filter(Boolean)
                .join(" · ") || "No classification yet."}
            </p>
            {transaction.source === "CSV" && (
              <p className="field-hint">
                Imported date, amount and description preserve the source record
                and cannot be edited.
              </p>
            )}
            {!transaction.permissions.canClassify && (
              <p className="field-hint">
                The owner controls corrections and shared classification. Your
                own note remains private.
              </p>
            )}
          </section>
          <div className="finance-grid">
            <div className="finance-stack">
              {transaction.permissions.canCorrect && (
                <EntryForm
                  key={transaction.id}
                  householdId={householdId}
                  accountId={transaction.accountId}
                  transaction={transaction}
                  saved={setTransaction}
                />
              )}
              {transaction.permissions.canClassify && (
                <ClassificationForm
                  householdId={householdId}
                  transaction={transaction}
                  saved={setTransaction}
                />
              )}
            </div>
            {transaction.permissions.canNote && (
              <PrivateNoteForm
                householdId={householdId}
                transaction={transaction}
                saved={setTransaction}
              />
            )}
          </div>
        </div>
      )}
    </AccountsFrame>
  );
}
