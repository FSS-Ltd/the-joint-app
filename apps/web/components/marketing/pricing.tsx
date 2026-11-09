import React from "react";
import { marketingCopy } from "./content";

export function MarketingPricing(): React.ReactElement {
  const { pricing } = marketingCopy;
  return (
    <section
      id="pricing"
      className="marketing-section"
      aria-labelledby="pricing-title"
    >
      <header className="marketing-section-header">
        <span className="marketing-eyebrow">{pricing.eyebrow}</span>
        <h2 id="pricing-title">{pricing.title}</h2>
        <p>{pricing.description}</p>
      </header>

      <div className="marketing-pricing-grid">
        {pricing.tiers.map((tier) => {
          const isFeatured = tier.id === "paid";
          return (
            <article
              key={tier.id}
              className={`marketing-price-card ${
                isFeatured ? "marketing-price-card--featured" : ""
              }`}
            >
              {isFeatured && (
                <span className="marketing-price-badge">Most Popular</span>
              )}
              <h3>{tier.name}</h3>
              <div className="marketing-price-amount">{tier.priceLabel}</div>
              <div className="marketing-price-period">{tier.billingPeriod}</div>
              <p className="marketing-price-desc">{tier.description}</p>
              <ul className="marketing-price-features">
                {tier.features.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <a
                href={tier.ctaHref}
                className={`marketing-btn ${
                  isFeatured
                    ? "marketing-btn--primary"
                    : "marketing-btn--secondary"
                }`}
              >
                {tier.ctaLabel}
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}
