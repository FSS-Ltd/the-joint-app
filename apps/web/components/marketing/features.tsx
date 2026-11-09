import React from "react";
import { marketingCopy } from "./content";

export function MarketingFeatures(): React.ReactElement {
  return (
    <section
      id="features"
      className="marketing-section"
      aria-labelledby="features-title"
    >
      <header className="marketing-section-header">
        <span className="marketing-eyebrow">Delivered Capabilities</span>
        <h2 id="features-title">Engineered for real household collaboration</h2>
        <p>
          Five core capabilities designed for mutual clarity and absolute
          privacy.
        </p>
      </header>

      <div className="marketing-feature-grid">
        {marketingCopy.features.map((feature) => (
          <article key={feature.id} className="marketing-feature-card">
            <span className="marketing-eyebrow">{feature.badge}</span>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
