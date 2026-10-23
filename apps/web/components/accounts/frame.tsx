import { Brand } from "../brand";
import type { ReactNode } from "react";
import {
  AppNavigation,
  type AppDestination,
} from "../navigation/app-navigation";
import "../identity/identity-controls.css";
import "../identity/identity-layout.css";
import "./accounts.css";
import "../identity/product-shell.css";

export function AccountsFrame({
  title,
  description,
  household,
  children,
  active = "accounts",
  reportQuery,
}: {
  title: string;
  description: string;
  household?: string;
  children: ReactNode;
  reportQuery?: string;
  active?: AppDestination;
}): ReactNode {
  return (
    <div className="identity-shell accounts-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="identity-header">
        <Brand />
        <span className="environment-label">Local development</span>
      </header>
      <AppNavigation active={active} reportQuery={reportQuery} />
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
