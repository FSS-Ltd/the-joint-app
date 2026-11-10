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

          {/* Navigation */}
          <nav className="marketing-nav" aria-label="Main Navigation">
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
