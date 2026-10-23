"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import type { DeletionReceipt } from "@joint/contracts";
import {
  announceSessionChange,
  errorMessage,
  request,
  RequestError,
} from "../identity/client";
import { Feedback } from "../identity/frame";

export function PrivacyActions({
  householdId,
}: {
  householdId?: string;
}): ReactNode {
  const [action, setAction] = useState<"leave" | "delete" | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [mfa, setMfa] = useState(false);
  const [requestId, setRequestId] = useState("");
  function choose(next: "leave" | "delete") {
    setAction(next);
    setConfirmation(false);
    setError("");
    setMfa(false);
    setRequestId(crypto.randomUUID());
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmation || !action) return;
    setPending(true);
    setError("");
    setMfa(false);
    try {
      if (action === "leave") {
        if (!householdId)
          throw new Error("Household access changed. Refresh before leaving.");
        await request(
          `/api/households/${householdId}/memberships/me`,
          { confirmation: "LEAVE_HOUSEHOLD", requestId },
          undefined,
          { method: "DELETE" },
        );
        announceSessionChange();
        window.location.replace("/sign-in?next=archive");
      } else {
        const receipt = await request<Omit<DeletionReceipt, "statusToken">>(
          "/api/privacy/deletion-requests",
          { confirmation: "DELETE_MY_ACCOUNT", requestId },
        );
        announceSessionChange();
        window.location.replace(`/privacy/deletion?id=${receipt.id}`);
      }
    } catch (cause) {
      setError(errorMessage(cause));
      setMfa(
        cause instanceof RequestError && cause.code === "MFA_REAUTH_REQUIRED",
      );
      setPending(false);
    }
  }
  return (
    <section className="surface form-card privacy-danger">
      <p className="step-label">Your next chapter</p>
      <h2>Leave or delete</h2>
      <p>
        You can leave without exporting first. After leaving, sign in again to
        read and export accounts you legally own.
      </p>
      <div className="privacy-stack">
        {householdId && (
          <button
            className="button secondary"
            disabled={pending}
            onClick={() => choose("leave")}
          >
            Leave household
          </button>
        )}
        <button
          className="button secondary"
          disabled={pending}
          onClick={() => choose("delete")}
        >
          Delete my account
        </button>
      </div>
      {action && (
        <form className="form-stack" onSubmit={submit} aria-busy={pending}>
          <h3>
            {action === "leave"
              ? "Confirm leaving your household"
              : "Confirm account deletion"}
          </h3>
          <p>
            {action === "leave"
              ? "Your household membership and shared access end immediately. Invitations and sessions are revoked. Your owned history remains in your read-only archive. Other people keep the accounts they own."
              : "Your app access and sessions end immediately. Deletion removes your private information and access. Another adult’s accounts and legally retained joint history remain. Provider cleanup may finish later. This cannot be undone."}
          </p>
          <label className="privacy-choice">
            <input
              type="checkbox"
              checked={confirmation}
              disabled={pending}
              required
              onChange={(event) => setConfirmation(event.target.checked)}
            />
            <span>
              I understand these consequences and want to{" "}
              {action === "leave" ? "leave my household" : "delete my account"}.
            </span>
          </label>
          <Feedback error={error} />
          {mfa && (
            <a href="/security?next=privacy&reauth=1">
              Verify a fresh authenticator code
            </a>
          )}
          <button
            className="button primary"
            disabled={pending || !confirmation}
            type="submit"
          >
            {pending
              ? "Submitting…"
              : action === "leave"
                ? "Confirm and leave household"
                : "Confirm and delete my account"}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={pending}
            onClick={() => setAction(null)}
          >
            Cancel
          </button>
        </form>
      )}
    </section>
  );
}
