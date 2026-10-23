"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { accountCreateSchema, type AccountResponse } from "@joint/contracts";
import { errorMessage, request } from "../identity/client";
import { Feedback } from "../identity/frame";
import { accountPath, kinds, liquidityLabels } from "./presentation";

export function CreateAccountForm({
  householdId,
  verified,
}: {
  householdId: string;
  verified: boolean;
}): ReactNode {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState("CURRENT");
  const [liquidity, setLiquidity] = useState("AVAILABLE");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsed = accountCreateSchema.safeParse({
      label,
      kind,
      liquidity,
      currency: "GBP",
    });
    if (!parsed.success) {
      setError("Check the account name, type and availability.");
      return;
    }
    setPending(true);
    const idempotencyKey = key || crypto.randomUUID();
    setKey(idempotencyKey);
    try {
      const result = await request<AccountResponse>(
        accountPath(householdId),
        parsed.data,
        idempotencyKey,
      );
      window.location.assign(`/accounts/${result.id}`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <details className="surface account-create" open={!verified}>
      <summary>
        Add a manual account<span aria-hidden="true">＋</span>
      </summary>
      <div className="account-create-body">
        <p>
          Start with an account you solely own. It stays private unless you
          choose to share access.
        </p>
        {!verified ? (
          <div className="account-mfa-note">
            <p>Verify your authenticator before adding an account.</p>
            <a className="button primary" href="/security?next=accounts">
              Verify your account
            </a>
          </div>
        ) : (
          <form className="form-stack" onSubmit={submit} aria-busy={pending}>
            <label>
              Account name
              <input
                required
                maxLength={80}
                value={label}
                disabled={pending}
                onChange={(event) => {
                  setLabel(event.target.value);
                  setKey("");
                }}
                placeholder="e.g. My everyday account"
              />
            </label>
            <label>
              Account type
              <select
                value={kind}
                disabled={pending}
                onChange={(event) => {
                  setKind(event.target.value);
                  setKey("");
                }}
              >
                {Object.entries(kinds).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Availability
              <select
                value={liquidity}
                disabled={pending}
                onChange={(event) => {
                  setLiquidity(event.target.value);
                  setKey("");
                }}
              >
                {Object.entries(liquidityLabels).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                Available now, restricted by conditions, or locked for later.
              </span>
            </label>
            <p className="field-hint">
              Owner: you · Currency: GBP · Source: Manual. Sharing viewing
              access never changes legal ownership.
            </p>
            <Feedback error={error} />
            <button
              className="button primary"
              disabled={pending || !label.trim()}
              type="submit"
            >
              {pending ? "Creating account…" : "Create private account"}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
        )}
      </div>
    </details>
  );
}
