"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { errorMessage, request } from "./client";
import { Feedback, IdentityFrame } from "./frame";
import { HouseholdSummary } from "./household-summary";
import { InvitationForm } from "./invitation-form";
import { useIdentity } from "./use-identity";
import { LogoutCompletion } from "./logout-completion";
import { useLogout } from "./use-logout";

export function Household(): ReactNode {
  const signout = useLogout();
  const { identity, error: loadError, loading, refresh } = useIdentity();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const idempotencyKey = key || crypto.randomUUID();
    setKey(idempotencyKey);
    try {
      await request("/api/households", { name: name.trim() }, idempotencyKey);
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  const membership = identity?.membership;
  if (signout.started) return <LogoutCompletion signout={signout} />;
  return (
    <IdentityFrame
      eyebrow="Your household"
      title={membership ? membership.household.name : "A home for your plans."}
      description="Start with the people. The rest can grow from here."
      navigation={identity ? "household" : undefined}
    >
      {loading && (
        <p className="surface form-card" role="status">
          Loading your household…
        </p>
      )}
      <Feedback error={loadError || error || signout.error} />
      {loadError && (
        <button
          className="button secondary"
          type="button"
          onClick={() => void refresh()}
        >
          Try again
        </button>
      )}
      {identity && !loading && (
        <>
          <div className="session-actions">
            <button
              type="button"
              className="text-button"
              disabled={pending || signout.pending}
              onClick={() => void signout.logout("local")}
            >
              Sign out
            </button>
          </div>
          {!membership ? (
            <section
              className="surface form-card"
              aria-labelledby="create-heading"
            >
              <p className="step-label">Your shared beginning</p>
              <h2 id="create-heading">Name your household</h2>
              <p>
                Choose a name that feels like home. Each household has room for
                two adults.
              </p>
              <form
                className="form-stack"
                onSubmit={create}
                aria-busy={pending}
              >
                <label>
                  Household name
                  <input
                    disabled={pending}
                    required
                    minLength={1}
                    maxLength={80}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setKey("");
                    }}
                    placeholder="e.g. Our little home"
                  />
                </label>
                <p className="field-hint">
                  Currency: GBP · Time zone: Europe/London
                </p>
                <button
                  className="button primary"
                  disabled={pending || !name.trim()}
                  type="submit"
                >
                  {pending ? "Creating household…" : "Create household"}
                  <span aria-hidden="true">↗</span>
                </button>
              </form>
              <p className="form-footnote">
                Have an invitation? Open the private link shared with you.
              </p>
            </section>
          ) : (
            <div className="household-panels">
              <HouseholdSummary identity={identity} membership={membership} />
              {membership.role === "ADMIN" &&
                membership.household.memberCount < 2 && (
                  <InvitationForm householdId={membership.householdId} />
                )}
            </div>
          )}
          <aside className="development-note">
            <p className="step-label">A foundation, with care</p>
            <h2>One small step at a time.</h2>
            <p>
              Start with private manual accounts and CSV imports. Your household
              membership and account security stay separate from sharing
              permissions. Direct bank and broker connections are not available.
            </p>
          </aside>
          <p className="privacy-note break-word">
            Signed in as {identity.user.email}
          </p>
          <button
            className="text-button"
            disabled={pending || signout.pending}
            type="button"
            onClick={() => void signout.logout("global")}
          >
            Sign out on all devices
          </button>
        </>
      )}
    </IdentityFrame>
  );
}
