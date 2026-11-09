import { describe, expect, it, vi } from "vitest";
import { load } from "./fixtures/native-read-ui.js";
import type {
  NativeProduct,
  PurchaseResult,
  RestoreResult,
} from "../packages/contracts/src/index.js";

interface PlatformPurchaseAdapter {
  readonly platform: "ios" | "android" | "unsupported";
  isAvailable(): Promise<boolean>;
  getProducts(): Promise<NativeProduct[]>;
  purchase(productId: string, householdId: string): Promise<PurchaseResult>;
  restore(householdId: string): Promise<RestoreResult>;
  openManageSubscriptions(): Promise<void>;
}

type AdapterConstructor = new (options?: {
  isAvailable?: () => Promise<boolean>;
  purchaseHandler?: (
    productId: string,
    householdId: string,
  ) => Promise<PurchaseResult>;
  restoreHandler?: (householdId: string) => Promise<RestoreResult>;
  openUrl?: (url: string) => Promise<void>;
}) => PlatformPurchaseAdapter;

const openUrlMock = vi.fn(async () => {});

const purchaseAdapterModule = load("billing/purchase-adapter.ts", {
  "expo-linking": {
    openURL: openUrlMock,
  },
  "react-native": {
    Platform: { OS: "ios" },
  },
}) as {
  ApplePurchaseAdapter: AdapterConstructor;
  GooglePurchaseAdapter: AdapterConstructor;
  UnsupportedPurchaseAdapter: new () => PlatformPurchaseAdapter;
  createPlatformPurchaseAdapter: (
    platformOverride?: string,
    options?: unknown,
  ) => PlatformPurchaseAdapter;
  DEFAULT_NATIVE_PRODUCTS: readonly NativeProduct[];
  APPLE_SUBSCRIPTION_MANAGEMENT_URL: string;
  GOOGLE_SUBSCRIPTION_MANAGEMENT_URL: string;
};

const {
  ApplePurchaseAdapter,
  GooglePurchaseAdapter,
  UnsupportedPurchaseAdapter,
  createPlatformPurchaseAdapter,
  DEFAULT_NATIVE_PRODUCTS,
  APPLE_SUBSCRIPTION_MANAGEMENT_URL,
  GOOGLE_SUBSCRIPTION_MANAGEMENT_URL,
} = purchaseAdapterModule;

describe("Native Purchase Adapters", () => {
  const householdId = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d";
  const monthlyProductId = "the_joint_plus_monthly";
  const annualProductId = "the_joint_plus_annual";

  describe("Product Presentation and Localized Pricing", () => {
    it("exposes canonical monthly and annual Plus products in GBP", async () => {
      const adapter = new ApplePurchaseAdapter();
      const products = await adapter.getProducts();

      expect(products).toHaveLength(2);

      const monthly = products.find((p) => p.interval === "MONTHLY")!;
      expect(monthly.id).toBe(monthlyProductId);
      expect(monthly.priceFormatted).toBe("£4.99");
      expect(monthly.priceMinor).toBe(499);
      expect(monthly.currencyCode).toBe("GBP");
      expect(monthly.description).toContain("4 connected banks");

      const annual = products.find((p) => p.interval === "ANNUAL")!;
      expect(annual.id).toBe(annualProductId);
      expect(annual.priceFormatted).toBe("£49.99");
      expect(annual.priceMinor).toBe(4999);
      expect(annual.currencyCode).toBe("GBP");
      expect(annual.annualEquivalentMonthlyFormatted).toBe("£4.17/mo");
      expect(annual.savingsPercentage).toBe(16);
    });

    it("does not steer UK iOS users to external checkout URLs", () => {
      const products = DEFAULT_NATIVE_PRODUCTS;
      for (const prod of products) {
        expect((prod as Record<string, unknown>).checkoutUrl).toBeUndefined();
      }
    });
  });

  describe("ApplePurchaseAdapter (iOS)", () => {
    it("verifies in-app purchase availability on device", async () => {
      const adapter = new ApplePurchaseAdapter();
      expect(await adapter.isAvailable()).toBe(true);

      const restrictedAdapter = new ApplePurchaseAdapter({
        isAvailable: async () => false,
      });
      expect(await restrictedAdapter.isAvailable()).toBe(false);
    });

    it("handles successful StoreKit purchase", async () => {
      const adapter = new ApplePurchaseAdapter();
      const result = await adapter.purchase(annualProductId, householdId);

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.transactionId).toContain("sk_txn_");
        expect(result.purchaseToken).toBeDefined();
      }
    });

    it("handles user cancellation gracefully without error state", async () => {
      const adapter = new ApplePurchaseAdapter({
        purchaseHandler: async () => ({ kind: "canceled" }),
      });
      const result = await adapter.purchase(monthlyProductId, householdId);

      expect(result.kind).toBe("canceled");
    });

    it("handles pending purchase authorization (Ask to Buy / bank delay)", async () => {
      const adapter = new ApplePurchaseAdapter({
        purchaseHandler: async () => ({ kind: "pending" }),
      });
      const result = await adapter.purchase(monthlyProductId, householdId);

      expect(result.kind).toBe("pending");
    });

    it("handles store purchase failures with descriptive error", async () => {
      const adapter = new ApplePurchaseAdapter({
        purchaseHandler: async () => ({
          kind: "error",
          message: "Payment card declined by issuer.",
        }),
      });
      const result = await adapter.purchase(monthlyProductId, householdId);

      expect(result.kind).toBe("error");
      if (result.kind === "error") {
        expect(result.message).toBe("Payment card declined by issuer.");
      }
    });

    it("rejects purchase without required household ID", async () => {
      const adapter = new ApplePurchaseAdapter();
      const result = await adapter.purchase(monthlyProductId, "");

      expect(result.kind).toBe("error");
      if (result.kind === "error") {
        expect(result.message).toContain("Household ID is required");
      }
    });

    it("restores prior StoreKit purchases without duplicate charge", async () => {
      const adapter = new ApplePurchaseAdapter();
      const result = await adapter.restore(householdId);

      expect(result.kind).toBe("restored");
      if (result.kind === "restored") {
        expect(result.transactionIds.length).toBeGreaterThan(0);
      }
    });

    it("handles restore when no previous store transactions exist", async () => {
      const adapter = new ApplePurchaseAdapter({
        restoreHandler: async () => ({ kind: "none_found" }),
      });
      const result = await adapter.restore(householdId);

      expect(result.kind).toBe("none_found");
    });

    it("opens Apple native subscription management URL", async () => {
      let openedUrl = "";
      const adapter = new ApplePurchaseAdapter({
        openUrl: async (url: string) => {
          openedUrl = url;
        },
      });

      await adapter.openManageSubscriptions();
      expect(openedUrl).toBe(APPLE_SUBSCRIPTION_MANAGEMENT_URL);
    });
  });

  describe("GooglePurchaseAdapter (Android)", () => {
    it("executes purchase and returns success on Android", async () => {
      const adapter = new GooglePurchaseAdapter();
      const result = await adapter.purchase(annualProductId, householdId);

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.transactionId).toContain("gp_txn_");
      }
    });

    it("restores purchases on Android", async () => {
      const adapter = new GooglePurchaseAdapter();
      const result = await adapter.restore(householdId);

      expect(result.kind).toBe("restored");
      if (result.kind === "restored") {
        expect(result.transactionIds.length).toBeGreaterThan(0);
      }
    });

    it("opens Google Play native subscription management URL", async () => {
      let openedUrl = "";
      const adapter = new GooglePurchaseAdapter({
        openUrl: async (url: string) => {
          openedUrl = url;
        },
      });

      await adapter.openManageSubscriptions();
      expect(openedUrl).toBe(GOOGLE_SUBSCRIPTION_MANAGEMENT_URL);
    });
  });

  describe("Platform Resolution & Fallbacks", () => {
    it("creates ApplePurchaseAdapter on ios platform", () => {
      const adapter = createPlatformPurchaseAdapter("ios");
      expect(adapter.platform).toBe("ios");
    });

    it("creates GooglePurchaseAdapter on android platform", () => {
      const adapter = createPlatformPurchaseAdapter("android");
      expect(adapter.platform).toBe("android");
    });

    it("creates UnsupportedPurchaseAdapter on web or unknown platform", async () => {
      const adapter = createPlatformPurchaseAdapter("web");
      expect(adapter).toBeInstanceOf(UnsupportedPurchaseAdapter);
      expect(adapter.platform).toBe("unsupported");
      expect(await adapter.isAvailable()).toBe(false);

      const purchaseRes = await adapter.purchase("id", householdId);
      expect(purchaseRes.kind).toBe("error");

      const restoreRes = await adapter.restore(householdId);
      expect(restoreRes.kind).toBe("error");
    });
  });
});
