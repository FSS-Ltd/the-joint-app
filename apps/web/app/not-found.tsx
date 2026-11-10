import React from "react";
import Link from "next/link";
import "../components/marketing/marketing.css";
import { Brand } from "../components/brand";

export default function NotFound(): React.ReactElement {
  return (
    <div
      className="marketing-container"
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      <header className="marketing-header">
        <div className="marketing-header-inner">
          <Brand />
          <nav className="marketing-nav" aria-label="Navigation">
            <Link href="/" className="marketing-nav-link">
              Home
            </Link>
            <Link href="/sign-in" className="marketing-nav-cta">
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      <main
        id="main-content"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "4rem 1.5rem",
        }}
      >
        <div style={{ maxWidth: "560px", textAlign: "center" }}>
          <span
            className="marketing-eyebrow"
            style={{ marginBottom: "1rem", display: "inline-block" }}
          >
            Status 404
          </span>
          <h1
            className="marketing-title"
            style={{ fontSize: "2.5rem", marginBottom: "1rem" }}
          >
            Page not found
          </h1>
          <p className="marketing-description" style={{ marginBottom: "2rem" }}>
            The requested link could not be located. Access your household
            portal or return to the overview.
          </p>
          <div className="marketing-actions">
            <Link href="/" className="marketing-btn marketing-btn--primary">
              Return to home
            </Link>
            <Link
              href="/sign-in"
              className="marketing-btn marketing-btn--secondary"
            >
              Sign in to household
            </Link>
          </div>
        </div>
      </main>

      <footer
        className="marketing-footer"
        style={{
          padding: "1.5rem",
          borderTop: "1px solid #cbdcd0",
          textAlign: "center",
        }}
      >
        <p style={{ margin: 0, fontSize: "0.875rem", color: "#334155" }}>
          The Family Fund. Confidential household finance.
        </p>
      </footer>
    </div>
  );
}
