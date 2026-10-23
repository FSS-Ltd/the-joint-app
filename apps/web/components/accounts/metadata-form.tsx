"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { accountPatchSchema, type AccountResponse } from "@joint/contracts";
import { request } from "../identity/client";
import { MutationFeedback } from "./mutation-feedback";
import { accountPath, liquidityLabels } from "./presentation";

export function MetadataForm({
  account,
  saved,
  reload,
}: {
  account: AccountResponse;
  saved: (account: AccountResponse) => void;
  reload: () => void;
}): ReactNode {
  const [label, setLabel] = useState(account.label);
  const [liquidity, setLiquidity] = useState<string>(account.liquidity);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess("");
    const parsed = accountPatchSchema.safeParse({ label, liquidity });
    if (!parsed.success) {
      setError(new Error("Enter an account name and choose its availability."));
      return;
    }
    setPending(true);
    try {
      saved(
        await request<AccountResponse>(
          accountPath(account.householdId, account.id),
          parsed.data,
          undefined,
          { method: "PATCH", ifMatch: account.version },
        ),
      );
      setSuccess("Account settings saved.");
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="surface form-card">
      <p className="step-label">Your account</p>
      <h2>Account settings</h2>
      <form className="form-stack" onSubmit={submit} aria-busy={pending}>
        <label>
          Account name
          <input
            required
            maxLength={80}
            value={label}
            disabled={pending}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label>
          Availability
          <select
            disabled={pending}
            value={liquidity}
            onChange={(event) => setLiquidity(event.target.value)}
          >
            {Object.entries(liquidityLabels).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <MutationFeedback error={error} success={success} reload={reload} />
        <button className="button secondary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        <p className="field-hint">
          The name and availability can change. Ownership, currency and source
          stay as recorded.
        </p>
      </form>
    </section>
  );
}
