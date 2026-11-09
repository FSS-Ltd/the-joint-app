import { Platform } from "react-native";
import * as Linking from "expo-linking";
import type {
  NativeProduct,
  PurchaseResult,
  RestoreResult,
} from "@joint/contracts";

export const APPLE_SUBSCRIPTION_MANAGEMENT_URL =
  "https://apps.apple.com/account/subscriptions";
export const GOOGLE_SUBSCRIPTION_MANAGEMENT_URL =
  "https://play.google.com/store/account/subscriptions";

export const DEFAULT_NATIVE_PRODUCTS: readonly NativeProduct[] = [
  {
    id: "the_joint_plus_monthly",
    interval: "MONTHLY",
    title: "Family Fund Plus (Monthly)",
    description:
      "4 connected banks, 2 brokers, local companion, and advanced budget caps.",
    priceFormatted: "£4.99",
    priceMinor: 499,
    currencyCode: "GBP",
  },
  {
    id: "the_joint_plus_annual",
    interval: "ANNUAL",
    title: "Family Fund Plus (Annual)",
    description:
      "Full household access billed annually at £49.99/year. Save 16%.",
    priceFormatted: "£49.99",
    priceMinor: 4999,
    currencyCode: "GBP",
    annualEquivalentMonthlyFormatted: "£4.17/mo",
    savingsPercentage: 16,
  },
];

export interface PlatformPurchaseAdapter {
  readonly platform: "ios" | "android" | "unsupported";
  isAvailable(): Promise<boolean>;
  getProducts(): Promise<NativeProduct[]>;
  purchase(productId: string, householdId: string): Promise<PurchaseResult>;
  restore(householdId: string): Promise<RestoreResult>;
  openManageSubscriptions(): Promise<void>;
}

export interface ApplePurchaseAdapterOptions {
  readonly isAvailable?: () => Promise<boolean>;
  readonly purchaseHandler?: (
    productId: string,
    householdId: string,
  ) => Promise<PurchaseResult>;
  readonly restoreHandler?: (householdId: string) => Promise<RestoreResult>;
  readonly openUrl?: (url: string) => Promise<void>;
}

export class ApplePurchaseAdapter implements PlatformPurchaseAdapter {
  readonly platform = "ios" as const;

  constructor(private readonly options: ApplePurchaseAdapterOptions = {}) {}

  async isAvailable(): Promise<boolean> {
    if (this.options.isAvailable) {
      return this.options.isAvailable();
    }
    return true;
  }

  async getProducts(): Promise<NativeProduct[]> {
    return [...DEFAULT_NATIVE_PRODUCTS];
  }

  async purchase(
    productId: string,
    householdId: string,
  ): Promise<PurchaseResult> {
    const product = DEFAULT_NATIVE_PRODUCTS.find((p) => p.id === productId);
    if (!product) {
      return { kind: "error", message: `Unknown product ID: ${productId}` };
    }
    if (!householdId) {
      return {
        kind: "error",
        message: "Household ID is required for purchase.",
      };
    }

    if (this.options.purchaseHandler) {
      return this.options.purchaseHandler(productId, householdId);
    }

    // Default simulated StoreKit execution for sandbox environments
    return {
      kind: "success",
      transactionId: `sk_txn_${Date.now()}`,
      purchaseToken: `sk_token_${Date.now()}`,
    };
  }

  async restore(householdId: string): Promise<RestoreResult> {
    if (!householdId) {
      return {
        kind: "error",
        message: "Household ID is required for restore.",
      };
    }
    if (this.options.restoreHandler) {
      return this.options.restoreHandler(householdId);
    }
    return {
      kind: "restored",
      transactionIds: [`sk_restore_${Date.now()}`],
    };
  }

  async openManageSubscriptions(): Promise<void> {
    const opener = this.options.openUrl ?? Linking.openURL;
    await opener(APPLE_SUBSCRIPTION_MANAGEMENT_URL);
  }
}

export interface GooglePurchaseAdapterOptions {
  readonly isAvailable?: () => Promise<boolean>;
  readonly purchaseHandler?: (
    productId: string,
    householdId: string,
  ) => Promise<PurchaseResult>;
  readonly restoreHandler?: (householdId: string) => Promise<RestoreResult>;
  readonly openUrl?: (url: string) => Promise<void>;
}

export class GooglePurchaseAdapter implements PlatformPurchaseAdapter {
  readonly platform = "android" as const;

  constructor(private readonly options: GooglePurchaseAdapterOptions = {}) {}

  async isAvailable(): Promise<boolean> {
    if (this.options.isAvailable) {
      return this.options.isAvailable();
    }
    return true;
  }

  async getProducts(): Promise<NativeProduct[]> {
    return [...DEFAULT_NATIVE_PRODUCTS];
  }

  async purchase(
    productId: string,
    householdId: string,
  ): Promise<PurchaseResult> {
    const product = DEFAULT_NATIVE_PRODUCTS.find((p) => p.id === productId);
    if (!product) {
      return { kind: "error", message: `Unknown product ID: ${productId}` };
    }
    if (!householdId) {
      return {
        kind: "error",
        message: "Household ID is required for purchase.",
      };
    }

    if (this.options.purchaseHandler) {
      return this.options.purchaseHandler(productId, householdId);
    }

    return {
      kind: "success",
      transactionId: `gp_txn_${Date.now()}`,
      purchaseToken: `gp_token_${Date.now()}`,
    };
  }

  async restore(householdId: string): Promise<RestoreResult> {
    if (!householdId) {
      return {
        kind: "error",
        message: "Household ID is required for restore.",
      };
    }
    if (this.options.restoreHandler) {
      return this.options.restoreHandler(householdId);
    }
    return {
      kind: "restored",
      transactionIds: [`gp_restore_${Date.now()}`],
    };
  }

  async openManageSubscriptions(): Promise<void> {
    const opener = this.options.openUrl ?? Linking.openURL;
    await opener(GOOGLE_SUBSCRIPTION_MANAGEMENT_URL);
  }
}

export class UnsupportedPurchaseAdapter implements PlatformPurchaseAdapter {
  readonly platform = "unsupported" as const;

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async getProducts(): Promise<NativeProduct[]> {
    return [...DEFAULT_NATIVE_PRODUCTS];
  }

  async purchase(): Promise<PurchaseResult> {
    return {
      kind: "error",
      message: "In-app purchases are not supported on this platform.",
    };
  }

  async restore(): Promise<RestoreResult> {
    return {
      kind: "error",
      message: "Restoring purchases is not supported on this platform.",
    };
  }

  async openManageSubscriptions(): Promise<void> {
    // No-op on unsupported platform
  }
}

export function createPlatformPurchaseAdapter(
  platformOverride?: string,
  options?: ApplePurchaseAdapterOptions & GooglePurchaseAdapterOptions,
): PlatformPurchaseAdapter {
  const currentPlatform = platformOverride ?? Platform.OS;
  if (currentPlatform === "ios") {
    return new ApplePurchaseAdapter(options);
  }
  if (currentPlatform === "android") {
    return new GooglePurchaseAdapter(options);
  }
  return new UnsupportedPurchaseAdapter();
}
