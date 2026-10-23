import type { ReactNode } from "react";
import "./identity-controls.css";
import "./identity-layout.css";

export function IdentityFrame({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="identity-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="identity-header">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            j.
          </span>
          The Joint App
        </a>
        <span className="environment-label">Local development</span>
      </header>
      <main className="identity-main" id="main">
        <section className="identity-intro" aria-labelledby="page-title">
          <p className="eyebrow">{eyebrow}</p>
          <h1 id="page-title">{title}</h1>
          <p className="identity-description">{description}</p>
          <div className="together-note">
            <span aria-hidden="true">↗</span>
            <p>
              A shared home.
              <br />
              <strong>Your own space.</strong>
            </p>
          </div>
        </section>
        <div className="identity-content">{children}</div>
      </main>
      <footer className="identity-footer">
        Built by FSS · UK first <span>Thoughtfully, together.</span>
      </footer>
    </div>
  );
}

export function Feedback({
  error,
  success,
}: {
  error?: string;
  success?: string;
}): ReactNode {
  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="form-success" role="status">
          {success}
        </p>
      )}
    </>
  );
}
