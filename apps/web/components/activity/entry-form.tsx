"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import type { TransactionResponse, Money } from "@joint/contracts";
import { parseMoneyInput, formatMoney } from "@joint/domain";
import { request, errorMessage } from "../identity/client";
import { isAccessError } from "../finance/access-error";
import { Feedback } from "../identity/frame";
import { financePath } from "../finance/http";
import { todayInLondon } from "../accounts/presentation";

export function EntryForm({
  householdId,
  accountId,
  transaction,
  saved,
  unavailable,
}: {
  householdId: string;
  accountId: string;
  transaction?: TransactionResponse;
  saved: (transaction: TransactionResponse) => void;
  unavailable?: () => void;
}): ReactNode {
  const [key, setKey] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setError("");
    setSuccess("");
    let money: Money;
    try {
      money = parseMoneyInput(String(form.get("amount")));
    } catch {
      setError(
        "Enter a GBP amount with at most two decimal places, such as -12.34.",
      );
      return;
    }
    const body = {
      bookedDate: String(form.get("bookedDate")),
      description: String(form.get("description")).trim(),
      money,
      ...(!transaction ? { accountId } : {}),
    };
    const stableKey = key || crypto.randomUUID();
    setKey(stableKey);
    setPending(true);
    try {
      const result = await request<TransactionResponse>(
        financePath(householdId, "transactions", transaction?.id),
        body,
        transaction ? undefined : stableKey,
        transaction ? { method: "PATCH", ifMatch: transaction.version } : {},
      );
      saved(result);
      setSuccess(
        transaction ? "Correction saved." : "Manual transaction recorded.",
      );
      setKey("");
      if (!transaction) element.reset();
    } catch (cause) {
      if (isAccessError(cause)) unavailable?.();
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  const minor = transaction ? BigInt(transaction.money.amountMinor) : null;
  const initialAmount =
    minor === null
      ? ""
      : `${minor < 0n ? "-" : ""}${(minor < 0n ? -minor : minor) / 100n}.${String((minor < 0n ? -minor : minor) % 100n).padStart(2, "0")}`;
  return (
    <section className="surface form-card">
      <p className="step-label">Manual · Your record</p>
      <h2>{transaction ? "Correct this entry" : "Add a manual entry"}</h2>
      <p>
        Positive amounts mean money coming in; negative amounts mean money going
        out. Activity does not change your separately dated account value.
      </p>
      <form
        className="form-stack"
        onSubmit={submit}
        onChange={() => setKey("")}
        aria-busy={pending}
      >
        <fieldset disabled={pending}>
          <div className="form-stack">
            <label>
              Booked date
              <input
                name="bookedDate"
                type="date"
                required
                max={todayInLondon()}
                defaultValue={transaction?.bookedDate ?? todayInLondon()}
              />
            </label>
            <label>
              Description
              <input
                name="description"
                required
                maxLength={500}
                defaultValue={transaction?.description ?? ""}
              />
            </label>
            <label>
              Amount (GBP)
              <input
                name="amount"
                type="text"
                inputMode="decimal"
                required
                defaultValue={initialAmount}
                placeholder="-12.34"
              />
            </label>
            {transaction && (
              <p className="field-hint">
                Current amount: {formatMoney(transaction.money)}. Corrections
                remain in the audit history.
              </p>
            )}
          </div>
        </fieldset>
        <button className="button primary" disabled={pending} type="submit">
          {pending
            ? "Saving…"
            : transaction
              ? "Save correction"
              : "Record transaction"}
        </button>
        <Feedback error={error} success={success} />
      </form>
    </section>
  );
}
