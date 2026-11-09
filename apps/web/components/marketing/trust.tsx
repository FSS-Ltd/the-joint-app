import React from "react";
import { marketingCopy } from "./content";

export function MarketingTrust(): React.ReactElement {
  const { trust } = marketingCopy;
  return (
    <section
      id="security"
      className="marketing-section"
      aria-labelledby="trust-title"
    >
      <header className="marketing-section-header">
        <span className="marketing-eyebrow">{trust.eyebrow}</span>
        <h2 id="trust-title">{trust.title}</h2>
        <p>
          Built with institutional-grade safeguards and complete transparency.
        </p>
      </header>

      <div className="marketing-trust-grid">
        {trust.points.map((pt) => (
          <article key={pt.title} className="marketing-trust-item">
            <h3>{pt.title}</h3>
            <p>{pt.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
