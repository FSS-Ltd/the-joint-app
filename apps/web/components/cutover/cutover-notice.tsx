import React from "react";
import "./cutover.css";
import { CUTOVER_LINKS } from "./presentation";

export interface CutoverNoticeProps {
  pageTitle?: string;
  previousRouteName?: string;
}

export function CutoverNotice({
  pageTitle = "Household Finance Has Moved to iOS",
  previousRouteName,
}: CutoverNoticeProps): React.ReactElement {
  return (
    <main className="cutover-container" aria-labelledby="cutover-title">
      <header className="cutover-header">
        <span className="cutover-eyebrow">The Family Fund App</span>
        <h1 id="cutover-title" className="cutover-title">
          {pageTitle}
        </h1>
        <p className="cutover-lead">
          Active household financial management is now handled exclusively in
          our native iOS application with private on-device intelligence.
        </p>
        {previousRouteName && (
          <p className="cutover-badge">
            The {previousRouteName} workspace on web has retired.
          </p>
        )}
      </header>

      <section className="cutover-grid" aria-label="Available Actions">
        <article className="cutover-card cutover-card--featured">
          <div className="cutover-card-content">
            <span className="cutover-card-tag">Native Experience</span>
            <h2>Download The Family Fund for iOS</h2>
            <p>
              Access your shared household budgets, discretionary spending caps,
              compound wealth projections, and the local AI companion on your
              iPhone.
            </p>
            <a
              href={CUTOVER_LINKS.appStore}
              className="cutover-button cutover-button--primary"
            >
              Get the iOS App
            </a>
          </div>
        </article>

        <article className="cutover-card">
          <div className="cutover-card-content">
            <span className="cutover-card-tag">Account Security</span>
            <h2>Security and Authentication</h2>
            <p>
              Manage multi-factor authentication, security passkeys, password
              credentials, and active sessions on the web portal.
            </p>
            <a
              href={CUTOVER_LINKS.security}
              className="cutover-button cutover-button--secondary"
            >
              Open Security Settings
            </a>
          </div>
        </article>

        <article className="cutover-card">
          <div className="cutover-card-content">
            <span className="cutover-card-tag">Data Rights</span>
            <h2>Privacy and Data Archive</h2>
            <p>
              Export your full household financial record as a structured ZIP
              archive or submit a statutory account deletion request.
            </p>
            <div className="cutover-links-group">
              <a href={CUTOVER_LINKS.archive} className="cutover-link">
                Download Data Archive
              </a>
              <a href={CUTOVER_LINKS.privacy} className="cutover-link">
                Privacy Settings
              </a>
              <a
                href={CUTOVER_LINKS.deletion}
                className="cutover-link cutover-link--danger"
              >
                Request Account Deletion
              </a>
            </div>
          </div>
        </article>
      </section>

      <footer className="cutover-footer">
        <nav aria-label="Quick Navigation" className="cutover-footer-nav">
          <a href="/">Return to Home</a>
          <span aria-hidden="true">•</span>
          <a href={CUTOVER_LINKS.signIn}>Sign In</a>
          <span aria-hidden="true">•</span>
          <a href={CUTOVER_LINKS.signOut}>Sign Out</a>
        </nav>
      </footer>
    </main>
  );
}

CutoverNotice.links = CUTOVER_LINKS;
CutoverNotice.hasFinancialPayloads = false;
CutoverNotice.isDataIsolated = true;
