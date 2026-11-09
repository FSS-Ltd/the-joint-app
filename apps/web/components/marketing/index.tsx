import React from "react";
import "./marketing.css";
import { MarketingHero } from "./hero";
import { MarketingFeatures } from "./features";
import { MarketingPricing } from "./pricing";
import { MarketingTrust } from "./trust";
import { MarketingFooter } from "./footer";

export function MarketingPage(): React.ReactElement {
  return (
    <div className="marketing-container">
      <header className="marketing-header">
        <div className="marketing-header-inner">
          <a href="/" className="marketing-brand">
            The Family Fund
          </a>
          <nav className="marketing-nav" aria-label="Main Navigation">
            <a href="#features" className="marketing-nav-link">
              Capabilities
            </a>
            <a href="#pricing" className="marketing-nav-link">
              Pricing
            </a>
            <a href="#security" className="marketing-nav-link">
              Security
            </a>
            <a href="/sign-in" className="marketing-nav-link">
              Sign In
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
        <MarketingFeatures />
        <MarketingPricing />
        <MarketingTrust />
      </main>

      <MarketingFooter />
    </div>
  );
}
