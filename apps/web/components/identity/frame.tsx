import { Brand } from "../brand";
import type { ReactNode } from "react";
import {
  AppNavigation,
  type AppDestination,
} from "../navigation/app-navigation";
import "./identity-controls.css";
import "./identity-layout.css";
import "./product-shell.css";
import "./identity-workspace.css";

export function IdentityFrame({
  eyebrow,
  title,
  description,
  children,
  navigation,
  idPrefix = "",
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  navigation?: AppDestination;
  idPrefix?: string;
}): ReactNode {
  const mainId = idPrefix ? `${idPrefix}-main` : "main";
  const titleId = idPrefix ? `${idPrefix}-page-title` : "page-title";
  return (
    <div
      className={`identity-shell identity-screen${navigation ? " has-app-navigation" : ""}`}
    >
      <a className="skip-link" href={`#${mainId}`}>
        Skip to content
      </a>
      <header className="identity-header">
        <Brand />
        <span className="environment-label">Local development</span>
      </header>
      {navigation && <AppNavigation active={navigation} />}
      <main className="identity-main" id={mainId}>
        <section className="identity-intro" aria-labelledby={titleId}>
          <p className="eyebrow">{eyebrow}</p>
          <h1 id={titleId}>{title}</h1>
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
