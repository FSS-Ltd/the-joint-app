export interface FeatureItem {
  id: string;
  title: string;
  description: string;
  badge: string;
}

export interface PricingTier {
  id: string;
  name: string;
  priceLabel: string;
  billingPeriod: string;
  description: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
}

export interface MarketingContent {
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    primaryCta: { label: string; href: string };
    secondaryCta: { label: string; href: string };
  };
  features: FeatureItem[];
  pricing: {
    eyebrow: string;
    title: string;
    description: string;
    tiers: PricingTier[];
  };
  trust: {
    eyebrow: string;
    title: string;
    points: { title: string; description: string }[];
  };
  footerLinks: {
    security: string;
    privacy: string;
    archive: string;
    deletion: string;
  };
}

export const marketingCopy: MarketingContent = {
  hero: {
    eyebrow: "Household Finance with True Privacy",
    title: "A clearer view of your money, together.",
    description:
      "Built for partners and households who want joint clarity on shared bills and savings without exposing individual discretionary spending or surrendering financial data to advertising brokers.",
    primaryCta: {
      label: "Download for iOS",
      href: "https://apps.apple.com/app/the-family-fund",
    },
    secondaryCta: {
      label: "Sign in to Web Portal",
      href: "/sign-in",
    },
  },
  features: [
    {
      id: "joint-budgeting",
      title: "Joint Budgeting with Individual Privacy",
      description:
        "Pool shared household expenses, recurring rent, mortgage, utilities, and groceries together while keeping private personal accounts and discretionary spending strictly confidential.",
      badge: "Core Architecture",
    },
    {
      id: "spending-caps",
      title: "Spending Targets and Real-Time Caps",
      description:
        "Set agreed monthly spending limits across categories. Track real-time progress toward targets with deterministic integer math and clear visual indicators.",
      badge: "Real-Time Tracking",
    },
    {
      id: "wealth-projections",
      title: "Compound Wealth Projections",
      description:
        "Forecast long-term savings and investment outcomes across multiple deterministic market scenarios. View compound growth over ten, twenty, and thirty years without speculative advice.",
      badge: "Financial Planning",
    },
    {
      id: "local-companion",
      title: "Local Offline AI Companion",
      description:
        "Interact with an intelligent financial assistant running locally on your hardware. Evaluate budgets and projections privately with zero cloud prompt uploads.",
      badge: "Private Intelligence",
    },
    {
      id: "privacy-architecture",
      title: "Privacy-First British and European Architecture",
      description:
        "Strict UK and EU data residency. Zero advertising networks, zero data broker resale, full data export in JSON and ZIP formats, and self-service statutory account deletion.",
      badge: "Data Sovereignty",
    },
  ],
  pricing: {
    eyebrow: "Simple Fair Pricing",
    title: "Transparent plans built for families.",
    description:
      "No hidden fees, no credit checks, and no advertising revenue models.",
    tiers: [
      {
        id: "free",
        name: "Household Baseline",
        priceLabel: "Free",
        billingPeriod: "Forever",
        description:
          "Essential household budgeting and manual tracking for two adults.",
        features: [
          "Two adults per household",
          "Manual transaction logging and CSV imports",
          "Shared household budget categories",
          "Discretionary category spending caps",
          "Self-service full data archive download",
          "Statutory account deletion rights",
        ],
        ctaLabel: "Get Started Free",
        ctaHref: "/sign-up",
      },
      {
        id: "paid",
        name: "Paid Household Membership",
        priceLabel: "£8 / month or £72 / year",
        billingPeriod: "Annual or Monthly Billing",
        description:
          "Advanced planning, compound projections, and local companion intelligence.",
        features: [
          "Everything in Household Baseline",
          "Multi-scenario compound wealth projections",
          "Local companion automated insight runs",
          "Priority encrypted archive export generation",
          "Flexible subscription management via Stripe portal",
          "Direct email customer support",
        ],
        ctaLabel: "Subscribe on Web or iOS",
        ctaHref: "/sign-in",
      },
    ],
  },
  trust: {
    eyebrow: "Security Standards",
    title: "Engineered for absolute trust.",
    points: [
      {
        title: "Bank-Grade Encryption",
        description:
          "All data encrypted in transit with TLS 1.3 and at rest with AES-256.",
      },
      {
        title: "Multi-Factor Authentication",
        description:
          "Hardware passkeys, WebAuthn, and TOTP support protect household access.",
      },
      {
        title: "Self-Service Emergency Recovery",
        description:
          "Independent recovery workflows ensure you never lose access to your data.",
      },
      {
        title: "Complete Data Portability",
        description:
          "Download your complete financial record at any time in structured open formats.",
      },
    ],
  },
  footerLinks: {
    security: "/security",
    privacy: "/settings/privacy",
    archive: "/archive",
    deletion: "/privacy/deletion",
  },
};
