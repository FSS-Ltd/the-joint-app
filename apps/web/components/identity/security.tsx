"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { errorMessage, nextDestination, request } from "./client";
import { Feedback, IdentityFrame } from "./frame";
import { useIdentity } from "./use-identity";

interface Enrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

export function Security(): ReactNode {
  const { identity, loading, error: loadError, refresh } = useIdentity();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reauth, setReauth] = useState(false);
  useEffect(() => {
    setReauth(
      new URLSearchParams(window.location.search).get("reauth") === "1",
    );
  }, []);
  const verifiedFactor = identity?.factors.find(
    (factor) => factor.status === "verified",
  );
  async function enroll() {
    setPending(true);
    setError("");
    try {
      setEnrollment(await request<Enrollment>("/api/auth/mfa/enroll", {}));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const factorId = enrollment?.factorId ?? verifiedFactor?.id;
    if (!factorId) {
      setError("Set up your authenticator before entering a code.");
      setPending(false);
      return;
    }
    try {
      const result = await request<{ state: string }>("/api/auth/mfa/verify", {
        factorId,
        code,
      });
      setEnrollment(null);
      setCode("");
      if (result.state === "PASSWORD_RESET_REQUIRED")
        window.location.assign(
          `/recovery${nextDestination() === "/household" ? "" : `?next=${nextDestination().slice(1)}`}`,
        );
      else if (
        identity?.session.needsMfa ||
        reauth ||
        nextDestination() === "/accounts"
      )
        window.location.assign(nextDestination());
      else {
        setSuccess(
          "Authenticator verified. Your account has an extra layer of protection.",
        );
        await refresh();
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <IdentityFrame
      eyebrow="Your account, protected"
      title="A little extra peace of mind."
      description="Keep your shared home secure, with a sign-in that belongs to you."
    >
      <nav className="account-nav" aria-label="Your account">
        <a href="/household">Back to household</a>
        <a href="/accounts">Accounts</a>
      </nav>
      <section className="surface form-card" aria-labelledby="security-heading">
        <p className="step-label">Two-step verification</p>
        <h2 id="security-heading">Your authenticator</h2>
        <Feedback error={error || loadError} success={success} />
        {loading ? (
          <p role="status">Loading account security…</p>
        ) : (
          identity && (
            <>
              <p className="break-word">
                Protecting <strong>{identity.user.email}</strong>
              </p>
              {verifiedFactor &&
              !identity.session.needsMfa &&
              !enrollment &&
              !reauth ? (
                <div className="verified-panel">
                  <span className="status">
                    {identity.session.aal === "aal2"
                      ? "Verified for this session"
                      : "Authenticator enabled"}
                  </span>
                  <p>
                    Your authenticator is enabled. You will be asked for a code
                    when an extra check is needed.
                  </p>
                </div>
              ) : (
                <>
                  <p>
                    {identity.session.needsMfa || reauth
                      ? "Enter the six-digit code from your authenticator app to continue."
                      : "Add The Joint App to your authenticator app, then enter a code to finish setup."}
                  </p>
                  {!verifiedFactor && !enrollment && (
                    <button
                      className="button primary"
                      disabled={pending}
                      type="button"
                      onClick={() => void enroll()}
                    >
                      {pending ? "Preparing setup…" : "Set up authenticator"}
                      <span aria-hidden="true">↗</span>
                    </button>
                  )}
                  {enrollment && (
                    <div className="enrollment">
                      <p className="privacy-label">
                        Private setup · Do not share this QR code or key.
                      </p>
                      {/* Provider SVG stays in an image document; never inject it into the page. */}
                      <img
                        className="qr-code"
                        src={
                          enrollment.qrCode.startsWith("data:image/svg+xml")
                            ? enrollment.qrCode
                            : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.qrCode)}`
                        }
                        alt="Scan this private setup QR code with your authenticator app"
                        width={200}
                        height={200}
                      />
                      <details>
                        <summary>Enter a setup key instead</summary>
                        <p className="field-hint">
                          Treat this key like a password. It is shown only
                          during setup.
                        </p>
                        <code className="setup-secret">
                          {enrollment.secret}
                        </code>
                      </details>
                    </div>
                  )}
                  {(verifiedFactor || enrollment) && (
                    <form
                      className="form-stack"
                      onSubmit={verify}
                      aria-busy={pending}
                    >
                      <label>
                        Authenticator code
                        <input
                          disabled={pending}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          pattern="[0-9]{6}"
                          required
                          minLength={6}
                          maxLength={6}
                          value={code}
                          onChange={(event) =>
                            setCode(event.target.value.replace(/\D/g, ""))
                          }
                          aria-describedby="code-hint"
                        />
                        <span className="field-hint" id="code-hint">
                          Enter the current six-digit code.
                        </span>
                      </label>
                      <button
                        className="button primary"
                        disabled={pending}
                        type="submit"
                      >
                        {pending ? "Verifying…" : "Verify code"}
                        <span aria-hidden="true">↗</span>
                      </button>
                    </form>
                  )}
                </>
              )}
            </>
          )
        )}
        {loadError && (
          <button
            className="button secondary"
            type="button"
            onClick={() => void refresh()}
          >
            Try again
          </button>
        )}
      </section>
      <p className="privacy-note">
        Setup is complete only after your code has been verified.
      </p>
    </IdentityFrame>
  );
}
