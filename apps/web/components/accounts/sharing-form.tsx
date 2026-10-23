"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { grantInputSchema, type AccountResponse } from "@joint/contracts";
import { request } from "../identity/client";
import { MutationFeedback } from "./mutation-feedback";
import { accountPath, grantLabels } from "./presentation";

export function SharingForm({
  account,
  saved,
  reload,
}: {
  account: AccountResponse;
  saved: (account: AccountResponse) => void;
  reload: () => void;
}): ReactNode {
  const [level, setLevel] = useState<string>(account.sharing?.level ?? "NONE");
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const sharing = account.sharing;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess("");
    const parsed = grantInputSchema.safeParse({ level });
    if (!parsed.success || !sharing?.membershipId) return;
    setPending(true);
    try {
      saved(
        await request<AccountResponse>(
          `${accountPath(account.householdId, account.id)}/grants/${sharing.membershipId}`,
          parsed.data,
          undefined,
          { method: "PUT", ifMatch: sharing.version },
        ),
      );
      setSuccess("Sharing preference saved.");
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="surface form-card account-sharing-form">
      <p className="step-label">Together, by choice</p>
      <h2>Choose what to share</h2>
      <p>
        You own this account. Granting access to the other adult never makes
        them an owner.
      </p>
      {!sharing?.membershipId ? (
        <>
          <p>
            There is no other active adult in your household yet. Your account
            stays private when someone joins.
          </p>
          <a className="button secondary" href="/household">
            Manage household invitations
          </a>
        </>
      ) : (
        <form className="form-stack" onSubmit={submit} aria-busy={pending}>
          <label>
            Other adult's access
            <select
              value={level}
              disabled={pending}
              onChange={(event) => setLevel(event.target.value)}
            >
              {Object.entries(grantLabels).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <p className="field-hint">
            Private means no access. Values only shares the account summary.
            “Values and details” includes booked activity. Private notes remain
            visible only to their author.
          </p>
          <p className="field-hint">
            Sharing more access requires an authenticator code verified within
            the last five minutes.
          </p>
          <MutationFeedback error={error} success={success} reload={reload} />
          <button
            className="button primary"
            disabled={pending || level === sharing.level}
            type="submit"
          >
            {pending ? "Saving sharing…" : "Save sharing"}
            <span aria-hidden="true">↗</span>
          </button>
        </form>
      )}
    </section>
  );
}
