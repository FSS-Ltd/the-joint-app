"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { Feedback } from "../frame";
import { errorMessage, request, announceSessionChange } from "../client";

export function LegacyLinkForm(): ReactNode {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await request("/api/auth/link-legacy", { factorId: "clerk_totp", code });
      setCode("");
      announceSessionChange();
      window.location.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <h2>Keep your existing household.</h2>
      <p>
        Link this sign-in to your existing account. Both accounts need a recent
        authenticator check on this browser.
      </p>
      <p>
        <a href="/security">Set up your new authenticator</a> before linking, if
        needed.
      </p>
      <label htmlFor="link-code">New account’s authenticator code</label>
      <input
        id="link-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        minLength={6}
        maxLength={6}
        required
        value={code}
        onChange={(event) => setCode(event.target.value)}
        disabled={pending}
      />
      <Feedback error={error} />
      <button className="button primary" type="submit" disabled={pending}>
        {pending ? "Verifying…" : "Verify and link account"}
      </button>
    </form>
  );
}
