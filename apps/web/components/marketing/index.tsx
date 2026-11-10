import React from "react";
import "./marketing.css";
import { Brand } from "../brand";
import { MarketingHero } from "./hero";
import { InteractivePreview } from "./interactive-preview";
import { MarketingFeatures } from "./features";
import { MarketingPricing } from "./pricing";
import { MarketingTrust } from "./trust";
import { MarketingFooter } from "./footer";

export function MarketingPage(): React.ReactElement {
  return (
    <div className="marketing-container">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="marketing-header">
        <div className="marketing-header-inner">
          <div className="marketing-brand-wrapper">
            <Brand />
            <span className="environment-label">In development</span>
          </div>

          {/* Desktop Navigation */}
          <nav
            className="marketing-nav marketing-nav--desktop"
            aria-label="Desktop Navigation"
          >
            <a
              href="https://github.com/FSS-Ltd/the-joint-app"
              className="marketing-nav-link"
            >
              Follow development on GitHub <span aria-hidden="true">↗</span>
            </a>
            <a href="/sign-in" className="marketing-nav-link">
              Sign in to your household <span aria-hidden="true">↗</span>
            </a>
            <a href="#features" className="marketing-nav-link">
              Capabilities
            </a>
            <a href="#pricing" className="marketing-nav-link">
              Pricing
            </a>
            <a href="#security" className="marketing-nav-link">
              Security
            </a>
            <a
              href="https://apps.apple.com/app/the-family-fund"
              className="marketing-nav-cta"
            >
              Get App
            </a>
          </nav>

          {/* Mobile Navigation Dropdown */}
          <details
            className="marketing-nav-mobile"
            aria-label="Mobile Navigation"
          >
            <summary
              className="marketing-nav-mobile-toggle"
              aria-label="Toggle navigation menu"
            >
              <span className="marketing-nav-mobile-toggle-text">Menu</span>
              <span className="marketing-nav-mobile-icon" aria-hidden="true">
                ▾
              </span>
            </summary>
            <div className="marketing-nav-mobile-drawer">
              <a
                href="https://apps.apple.com/app/the-family-fund"
                className="marketing-mobile-link marketing-mobile-link--highlight"
              >
                Download for iOS
              </a>
              <a href="/sign-in" className="marketing-mobile-link">
                Sign in to your household
              </a>
              <a href="#features" className="marketing-mobile-link">
                Capabilities
              </a>
              <a href="#pricing" className="marketing-mobile-link">
                Pricing
              </a>
              <a href="#security" className="marketing-mobile-link">
                Security &amp; Privacy
              </a>
              <a
                href="https://github.com/FSS-Ltd/the-joint-app"
                className="marketing-mobile-link"
              >
                GitHub Roadmap ↗
              </a>
            </div>
          </details>
        </div>
      </header>

      <main id="main-content">
        <MarketingHero />
        <InteractivePreview />
        <MarketingFeatures />
        <MarketingPricing />
        <MarketingTrust />
      </main>

      <MarketingFooter />
    </div>
  );
}
