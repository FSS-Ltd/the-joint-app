import { describe, expect, it } from "vitest";
import manifestFn from "../apps/web/app/manifest.js";
import {
  CUTOVER_LINKS,
  RETIRED_HOUSEHOLD_ROUTES,
  PRESERVED_WEB_ROUTES,
} from "../apps/web/components/cutover/presentation.js";
import { marketingCopy } from "../apps/web/components/marketing/content.js";

function getManifestConfig() {
  const fn = manifestFn as unknown as () => {
    start_url: string;
    background_color: string;
    theme_color: string;
  };
  return fn();
}

const BANNED_WORDS = [
  "additionally",
  "align with",
  "boasts",
  "bolstered",
  "crucial",
  "delve",
  "emphasizing",
  "enduring",
  "enhance",
  "fostering",
  "garner",
  "highlight",
  "interplay",
  "intricate",
  "intricacies",
  "key",
  "landscape",
  "meticulous",
  "meticulously",
  "pivotal",
  "showcase",
  "tapestry",
  "testament",
  "underscore",
  "valuable",
  "vibrant",
  "nestled",
  "groundbreaking",
  "renowned",
  "diverse array",
  "rich heritage",
  "natural beauty",
  "commitment to",
];

describe("IOS16 Marketing and Web Household Cutover", () => {
  describe("1. Web App Manifest Realignment", () => {
    it("points start_url to public root instead of retired dashboard", () => {
      const config = getManifestConfig() as { start_url: string };
      expect(config.start_url).toBe("/");
      expect(config.start_url).not.toBe("/dashboard");
    });

    it("uses brand identity theme and background colors", () => {
      const config = getManifestConfig() as {
        background_color: string;
        theme_color: string;
      };
      expect(config.background_color).toBe("#f7f5ef");
      expect(config.theme_color).toBe("#244f42");
    });
  });

  describe("2. Cutover Notice for Retired Household Pages", () => {
    it("defines clear guidance pointing to native iOS application", () => {
      expect(CUTOVER_LINKS.appStore).toContain("https://apps.apple.com/app/");
    });

    it("provides explicit links for security, privacy, and archive support", () => {
      expect(CUTOVER_LINKS.security).toBe("/security");
      expect(CUTOVER_LINKS.privacy).toBe("/settings/privacy");
      expect(CUTOVER_LINKS.archive).toBe("/archive");
      expect(CUTOVER_LINKS.deletion).toBe("/privacy/deletion");
      expect(CUTOVER_LINKS.signIn).toBe("/sign-in");
      expect(CUTOVER_LINKS.signOut).toBe("/sign-out");
    });
  });

  describe("3. Truthful Marketing Copy & Value Proposition", () => {
    it("features accurate headline and core position without pre-alpha placeholders", () => {
      expect(marketingCopy.hero.title).toBe(
        "A shared view of your family money, with complete individual privacy.",
      );
      expect(marketingCopy.hero.eyebrow).toBe(
        "Household Finance with True Privacy",
      );
      expect(marketingCopy.hero.description).toContain("joint clarity");
      expect(marketingCopy.hero.description).not.toContain("In development");
    });

    it("details delivered features matching native capabilities (IOS4-15)", () => {
      const features = marketingCopy.features.map((f) => f.title);
      expect(features).toContain("Joint Budgeting with Individual Privacy");
      expect(features).toContain("Spending Targets and Real-Time Caps");
      expect(features).toContain("Compound Wealth Projections");
      expect(features).toContain("Local Offline AI Companion");
      expect(features).toContain(
        "Privacy-First British and European Architecture",
      );
    });

    it("presents clear transparent subscription tiers", () => {
      const tiers = marketingCopy.pricing.tiers;
      expect(tiers.find((t) => t.id === "free")?.priceLabel).toBe("Free");
      expect(tiers.find((t) => t.id === "paid")?.priceLabel).toBe(
        "£8 / month or £72 / year",
      );
    });

    it("includes required trust and compliance links while isolating staff routes", () => {
      expect(marketingCopy.footerLinks.security).toBe("/security");
      expect(marketingCopy.footerLinks.privacy).toBe("/settings/privacy");
      expect(marketingCopy.footerLinks.archive).toBe("/archive");
      expect(marketingCopy.footerLinks.deletion).toBe("/privacy/deletion");
      // Verify complete staff route isolation: no staff endpoints in public footer
      expect("staff" in marketingCopy.footerLinks).toBe(false);
      expect(JSON.stringify(marketingCopy).includes("/staff")).toBe(false);
    });

    it("strictly complies with Brand and Voice rules: no em dashes and no banned words", () => {
      const serialized = JSON.stringify(marketingCopy);

      // Rule: No em dashes
      expect(serialized.includes("—")).toBe(false);

      // Rule: No banned words
      for (const banned of BANNED_WORDS) {
        const regex = new RegExp(`\\b${banned}\\b`, "i");
        expect(regex.test(serialized)).toBe(false);
      }
    });
  });

  describe("4. Route Audit & Cutover Coverage", () => {
    it("verifies retired household route inventory matches IOS-only delivery plan", () => {
      expect(RETIRED_HOUSEHOLD_ROUTES).toEqual([
        "/dashboard",
        "/accounts",
        "/accounts/[id]",
        "/activity",
        "/activity/[transactionId]",
        "/budgets",
        "/review",
        "/imports",
        "/imports/[batchId]",
        "/household",
      ]);
      expect(RETIRED_HOUSEHOLD_ROUTES).toHaveLength(10);
    });

    it("verifies preserved security, recovery, privacy, and staff routes", () => {
      expect(PRESERVED_WEB_ROUTES).toEqual([
        "/",
        "/sign-in",
        "/sign-up",
        "/sign-out",
        "/recovery",
        "/auth/callback",
        "/auth/complete",
        "/auth/task/password",
        "/security",
        "/settings/privacy",
        "/privacy/deletion",
        "/archive",
        "/join",
        "/staff",
      ]);
      expect(PRESERVED_WEB_ROUTES).toHaveLength(14);
    });
  });
});
