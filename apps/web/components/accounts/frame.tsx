import type { ReactNode } from "react";
import "../identity/identity-controls.css";
import "../identity/identity-layout.css";
import "./accounts.css";

export function AccountsFrame({
  title,
  description,
  household,
  children,
}: {
  title: string;
  description: string;
  household?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="identity-shell accounts-shell">
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
      <nav className="accounts-nav" aria-label="App">
        <a href="/accounts" aria-current="page">
          Accounts
        </a>
        <a href="/household">Household</a>
        <a href="/security">Security</a>
      </nav>
      <main className="accounts-main" id="main">
        <header className="accounts-heading">
          <p className="eyebrow">{household ?? "Your personal space"}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        {children}
      </main>
      <footer className="identity-footer">
        Built by FSS · UK first <span>Your money. Your choice.</span>
      </footer>
    </div>
  );
}
