import React from "react";
import { marketingCopy } from "./content";

export function MarketingHero(): React.ReactElement {
  const { hero } = marketingCopy;
  return (
    <section className="marketing-hero" aria-labelledby="hero-title">
      <span className="marketing-eyebrow">{hero.eyebrow}</span>
      <h1 id="hero-title" className="marketing-title">
        {hero.title}
      </h1>
      <p className="marketing-description">{hero.description}</p>
      <div className="marketing-actions">
        <a
          href={hero.primaryCta.href}
          className="marketing-btn marketing-btn--primary"
        >
          {hero.primaryCta.label}
        </a>
        <a
          href={hero.secondaryCta.href}
          className="marketing-btn marketing-btn--secondary"
        >
          {hero.secondaryCta.label}
        </a>
      </div>
    </section>
  );
}
