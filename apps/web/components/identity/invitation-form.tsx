"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { errorMessage, request } from "./client";
import { Feedback } from "./frame";

export function InvitationForm({
  householdId,
}: {
  householdId: string;
}): ReactNode {
  const [email, setEmail] = useState("");
  const [key, setKey] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setCopied(false);
    const idempotencyKey = key || crypto.randomUUID();
    setKey(idempotencyKey);
    try {
      const result = await request<{ token: string }>(
        `/api/households/${householdId}/invitations`,
        { email },
        idempotencyKey,
      );
      setLink(
        `${window.location.origin}/join#invite=${encodeURIComponent(result.token)}`,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="surface form-card" aria-labelledby="invite-heading">
      <p className="step-label">A place for two</p>
      <h2 id="invite-heading">Invite your person</h2>
      <p>
        Create a private link for the other adult in your household. Share it
        with them yourself, or start on your own and invite them later.
      </p>
      <form className="form-stack" onSubmit={invite} aria-busy={pending}>
        <label>
          Their email address
          <input
            disabled={pending}
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setKey("");
              setLink("");
            }}
          />
        </label>
        <Feedback error={error} />
        <button className="button primary" type="submit" disabled={pending}>
          {pending ? "Creating link…" : "Create invitation link"}
          <span aria-hidden="true">↗</span>
        </button>
        <a className="button secondary" href="/accounts">
          Invite later<span aria-hidden="true">↗</span>
        </a>
      </form>
      {link && (
        <div className="invite-result">
          <label>
            Private invitation link
            <textarea readOnly value={link} rows={3} />
          </label>
          <button
            className="button secondary"
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                setError(
                  "Copy is unavailable. Select and copy the link above.",
                );
              }
            }}
          >
            Copy invitation link
          </button>
          <Feedback
            success={copied ? "Link copied." : "Invitation ready to share."}
          />
        </div>
      )}
      <p className="field-hint">
        One use · Expires after 7 days. A replacement invitation invalidates the
        previous link. Keep this link private.
      </p>
    </section>
  );
}
