"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import type { AccountResponse, Money } from "@joint/contracts";
import { isLiabilityKind, parseMoneyInput } from "@joint/domain";
import { request } from "../identity/client";
import { MutationFeedback } from "./mutation-feedback";
import { accountPath, todayInLondon } from "./presentation";

export function ValuationForm({
  account,
  saved,
  reload,
}: {
  account: AccountResponse;
  saved: (account: AccountResponse) => void;
  reload: () => void;
}): ReactNode {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayInLondon);
  const [key, setKey] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const liability = isLiabilityKind(account.kind);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess("");
    let money: Money;
    try {
      money = parseMoneyInput(amount);
      if (liability && BigInt(money.amountMinor) < 0n)
        throw new Error("Enter outstanding debt as zero or a positive amount.");
    } catch (cause) {
      setError(cause);
      return;
    }
    const idempotencyKey = key || crypto.randomUUID();
    setKey(idempotencyKey);
    setPending(true);
    try {
      saved(
        await request<AccountResponse>(
          `${accountPath(account.householdId, account.id)}/valuations`,
          { money, asOfDate: date },
          idempotencyKey,
          { ifMatch: account.version },
        ),
      );
      setAmount("");
      setKey("");
      setSuccess("Manual value recorded.");
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="surface form-card">
      <p className="step-label">A moment in time</p>
      <h2>Record a manual value</h2>
      <p>
        Record what this account was worth on a particular date. Each value is a
        new dated record.
      </p>
      <form className="form-stack" onSubmit={submit} aria-busy={pending}>
        <label>
          {liability ? "Outstanding debt (GBP)" : "Value (GBP)"}
          <input
            required
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            disabled={pending}
            onChange={(event) => {
              setAmount(event.target.value);
              setKey("");
            }}
          />
          <span className="field-hint">
            {liability
              ? "Use zero or a positive amount owed."
              : "Use a decimal point and up to two decimal places. Negative values are allowed."}{" "}
            No commas or currency symbols.
          </span>
        </label>
        <label>
          As-of date
          <input
            type="date"
            required
            value={date}
            disabled={pending}
            onChange={(event) => {
              setDate(event.target.value);
              setKey("");
            }}
          />
        </label>
        <MutationFeedback error={error} success={success} reload={reload} />
        <button className="button primary" disabled={pending} type="submit">
          {pending ? "Recording value…" : "Record value"}
          <span aria-hidden="true">↗</span>
        </button>
      </form>
    </section>
  );
}
