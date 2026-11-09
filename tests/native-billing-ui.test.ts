import { describe, expect, it, vi } from "vitest";
import type {
  HouseholdSubscriptionResponse,
  NativeProduct,
  PurchaseResult,
  RestoreResult,
} from "../packages/contracts/src/index.js";
import { elements, hookHarness } from "./fixtures/native-source-harness.js";
import { load, text } from "./fixtures/native-read-ui.js";

interface BillingApi {
  getSubscription(
    householdId: string,
    signal?: AbortSignal,
  ): Promise<HouseholdSubscriptionResponse>;
}

interface PlatformPurchaseAdapter {
  readonly platform: "ios" | "android" | "unsupported";
  isAvailable(): Promise<boolean>;
  getProducts(): Promise<NativeProduct[]>;
  purchase(productId: string, householdId: string): Promise<PurchaseResult>;
  restore(householdId: string): Promise<RestoreResult>;
  openManageSubscriptions(): Promise<void>;
}

const householdId = "00000000-0000-4000-8000-000000000001";

function createMockBillingApi(
  response: HouseholdSubscriptionResponse,
): BillingApi {
  return {
    getSubscription: vi.fn(async () => response),
  };
}

function createMockPurchaseAdapter(
  overrides: Partial<PlatformPurchaseAdapter> = {},
): PlatformPurchaseAdapter {
  return {
    platform: "ios",
    isAvailable: vi.fn(async () => true),
    getProducts: vi.fn(async () => [
      {
        id: "the_joint_plus_monthly",
        interval: "MONTHLY" as const,
        title: "Family Fund Plus (Monthly)",
        description:
          "4 connected banks, 2 brokers, local companion, advanced budget caps.",
        priceFormatted: "£4.99",
        priceMinor: 499,
        currencyCode: "GBP",
      },
      {
        id: "the_joint_plus_annual",
        interval: "ANNUAL" as const,
        title: "Family Fund Plus (Annual)",
        description:
          "Full household access billed annually at £49.99/year. Save 16%.",
        priceFormatted: "£49.99",
        priceMinor: 4999,
        currencyCode: "GBP",
        annualEquivalentMonthlyFormatted: "£4.17/mo",
        savingsPercentage: 16,
      },
    ]),
    purchase: vi.fn(async () => ({
      kind: "success" as const,
      transactionId: "sk_mock_txn_123",
      purchaseToken: "sk_mock_token_123",
    })),
    restore: vi.fn(async () => ({
      kind: "restored" as const,
      transactionIds: ["sk_mock_restore_123"],
    })),
    openManageSubscriptions: vi.fn(async () => {}),
    ...overrides,
  };
}

const purchaseAdapterModule = load("billing/purchase-adapter.ts", {
  "expo-linking": {
    openURL: vi.fn(),
  },
  "react-native": {
    Platform: { OS: "ios" },
  },
});

interface UseBillingState {
  readonly loading: boolean;
  readonly subscription: unknown;
  readonly plan: "FREE" | "PLUS";
  readonly isPlusActive: boolean;
  readonly effectiveUntil: string | null;
  readonly products: readonly NativeProduct[];
  readonly selectedProduct: NativeProduct | undefined;
  readonly selectedInterval: "MONTHLY" | "ANNUAL";
  setSelectedInterval(interval: "MONTHLY" | "ANNUAL"): void;
  readonly purchasePending: boolean;
  readonly restorePending: boolean;
  readonly statusNotice: { text: string; tone: string } | null;
  clearStatusNotice(): void;
  readonly storeAvailable: boolean;
  purchase(): Promise<void>;
  restore(): Promise<void>;
  manageSubscription(): Promise<void>;
  refresh(signal?: AbortSignal): Promise<unknown>;
}

interface UseBillingOptions {
  readonly householdId: string;
  readonly billingApi: BillingApi;
  readonly purchaseAdapter?: PlatformPurchaseAdapter;
  readonly initialSubscription?: HouseholdSubscriptionResponse | null;
  readonly onSubscriptionUpdated?: () => void;
}

interface BillingScreenProps {
  readonly householdId: string;
  readonly billingApi: BillingApi;
  readonly purchaseAdapter?: PlatformPurchaseAdapter;
  readonly initialSubscription?: HouseholdSubscriptionResponse | null;
  readonly onBack?: () => void;
  readonly onSubscriptionUpdated?: () => void;
}

function loadUseBilling(reactHarness: ReturnType<typeof hookHarness>["react"]) {
  return load("billing/use-billing.ts", {
    react: reactHarness,
    "./purchase-adapter": purchaseAdapterModule,
  }) as {
    useBilling: (options: UseBillingOptions) => UseBillingState;
  };
}

function loadBillingScreen(
  reactHarness: ReturnType<typeof hookHarness>["react"],
) {
  const useBillingModule = loadUseBilling(reactHarness);
  return load("billing/billing-screen.tsx", {
    react: reactHarness,
    "./use-billing": useBillingModule,
    "./purchase-adapter": purchaseAdapterModule,
  }) as {
    BillingScreen: (props: BillingScreenProps) => unknown;
  };
}

describe("Billing Feature Hook & Screen", () => {
  const freeResponse: HouseholdSubscriptionResponse = {
    subscription: null,
    plan: "FREE",
    effectiveUntil: null,
  };

  const activePlusResponse: HouseholdSubscriptionResponse = {
    subscription: {
      id: "sub_12345678-1234-4234-8234-123456789012",
      householdId,
      purchaserUserId: "usr_12345678-1234-4234-8234-123456789012",
      provider: "REVENUECAT",
      environment: "PRODUCTION",
      externalCustomerId: "rc_cust_123",
      externalSubscriptionId: "rc_sub_123",
      status: "ACTIVE",
      interval: "ANNUAL",
      effectiveUntil: "2027-11-09T00:00:00.000Z",
      graceUntil: null,
      cancelAtPeriodEnd: false,
      lastEventId: "evt_123",
      lastEventAt: "2026-11-09T00:00:00.000Z",
      createdAt: "2026-11-09T00:00:00.000Z",
      updatedAt: "2026-11-09T00:00:00.000Z",
    },
    plan: "PLUS",
    effectiveUntil: "2027-11-09T00:00:00.000Z",
  };

  describe("useBilling Hook Workflow", () => {
    it("initializes with free plan and default products", async () => {
      const h = hookHarness();
      const { useBilling } = loadUseBilling(h.react);

      const billingApi = createMockBillingApi(freeResponse);
      const purchaseAdapter = createMockPurchaseAdapter();

      const state = h.render(() =>
        useBilling({
          householdId,
          billingApi,
          purchaseAdapter,
        }),
      );

      expect(state.plan).toBe("FREE");
      expect(state.isPlusActive).toBe(false);
      expect(state.selectedInterval).toBe("ANNUAL");
      expect(state.products).toHaveLength(2);
      expect(state.selectedProduct?.priceFormatted).toBe("£49.99");
    });

    it("allows cadence switching between Annual and Monthly", async () => {
      const h = hookHarness();
      const { useBilling } = loadUseBilling(h.react);

      const billingApi = createMockBillingApi(freeResponse);
      const purchaseAdapter = createMockPurchaseAdapter();

      let state = h.render(() =>
        useBilling({
          householdId,
          billingApi,
          purchaseAdapter,
        }),
      );

      expect(state.selectedInterval).toBe("ANNUAL");

      state.setSelectedInterval("MONTHLY");
      state = h.render(() =>
        useBilling({
          householdId,
          billingApi,
          purchaseAdapter,
        }),
      );

      expect(state.selectedInterval).toBe("MONTHLY");
      expect(state.selectedProduct?.id).toBe("the_joint_plus_monthly");
      expect(state.selectedProduct?.priceFormatted).toBe("£4.99");
    });

    it("handles voluntary user cancellation during purchase without error banner", async () => {
      const h = hookHarness();
      const { useBilling } = loadUseBilling(h.react);

      const billingApi = createMockBillingApi(freeResponse);
      const purchaseAdapter = createMockPurchaseAdapter({
        purchase: vi.fn(async () => ({ kind: "canceled" as const })),
      });

      const state = h.render(() =>
        useBilling({
          householdId,
          billingApi,
          purchaseAdapter,
        }),
      );

      await state.purchase();

      const updatedState = h.render(() =>
        useBilling({
          householdId,
          billingApi,
          purchaseAdapter,
        }),
      );

      expect(updatedState.statusNotice).toBeNull();
      expect(updatedState.purchasePending).toBe(false);
    });

    it("handles pending purchase authorization notice", async () => {
      const h = hookHarness();
      const { useBilling } = loadUseBilling(h.react);

      const billingApi = createMockBillingApi(freeResponse);
      const purchaseAdapter = createMockPurchaseAdapter({
        purchase: vi.fn(async () => ({ kind: "pending" as const })),
      });

      const state = h.render(() =>
        useBilling({
          householdId,
          billingApi,
          purchaseAdapter,
        }),
      );

      await state.purchase();

      const updatedState = h.render(() =>
        useBilling({
          householdId,
          billingApi,
          purchaseAdapter,
        }),
      );

      expect(updatedState.statusNotice?.tone).toBe("info");
      expect(updatedState.statusNotice?.text).toContain(
        "pending authorization",
      );
    });

    it("handles purchase error with error banner", async () => {
      const h = hookHarness();
      const { useBilling } = loadUseBilling(h.react);

      const billingApi = createMockBillingApi(freeResponse);
      const purchaseAdapter = createMockPurchaseAdapter({
        purchase: vi.fn(async () => ({
          kind: "error" as const,
          message: "Payment method not accepted.",
        })),
      });

      const state = h.render(() =>
        useBilling({
          householdId,
          billingApi,
          purchaseAdapter,
        }),
      );

      await state.purchase();

      const updatedState = h.render(() =>
        useBilling({
          householdId,
          billingApi,
          purchaseAdapter,
        }),
      );

      expect(updatedState.statusNotice?.tone).toBe("error");
      expect(updatedState.statusNotice?.text).toBe(
        "Payment method not accepted.",
      );
    });

    it("prevents duplicate purchase if household already has active Plus", async () => {
      const h = hookHarness();
      const { useBilling } = loadUseBilling(h.react);

      const billingApi = createMockBillingApi(activePlusResponse);
      const purchaseAdapter = createMockPurchaseAdapter();

      const state = h.render(() =>
        useBilling({
          householdId,
          billingApi,
          purchaseAdapter,
          initialSubscription: activePlusResponse,
        }),
      );

      await state.purchase();

      const updatedState = h.render(() =>
        useBilling({
          householdId,
          billingApi,
          purchaseAdapter,
          initialSubscription: activePlusResponse,
        }),
      );

      expect(purchaseAdapter.purchase).not.toHaveBeenCalled();
      expect(updatedState.statusNotice?.text).toContain(
        "already has an active Plus subscription",
      );
    });

    it("restores purchases and triggers update callback", async () => {
      const h = hookHarness();
      const { useBilling } = loadUseBilling(h.react);

      let currentResponse = freeResponse;
      const billingApi: BillingApi = {
        getSubscription: vi.fn(async () => currentResponse),
      };
      const purchaseAdapter = createMockPurchaseAdapter({
        restore: vi.fn(async () => {
          currentResponse = activePlusResponse;
          return {
            kind: "restored" as const,
            transactionIds: ["sk_restored_1"],
          };
        }),
      });

      const onUpdated = vi.fn();
      const state = h.render(() =>
        useBilling({
          householdId,
          billingApi,
          purchaseAdapter,
          onSubscriptionUpdated: onUpdated,
        }),
      );

      await state.restore();

      const updatedState = h.render(() =>
        useBilling({
          householdId,
          billingApi,
          purchaseAdapter,
          onSubscriptionUpdated: onUpdated,
        }),
      );

      expect(purchaseAdapter.restore).toHaveBeenCalledWith(householdId);
      expect(onUpdated).toHaveBeenCalled();
      expect(updatedState.statusNotice?.tone).toBe("success");
    });

    it("delegates manageSubscription to platform adapter", async () => {
      const h = hookHarness();
      const { useBilling } = loadUseBilling(h.react);

      const billingApi = createMockBillingApi(activePlusResponse);
      const purchaseAdapter = createMockPurchaseAdapter();

      const state = h.render(() =>
        useBilling({
          householdId,
          billingApi,
          purchaseAdapter,
        }),
      );

      await state.manageSubscription();
      expect(purchaseAdapter.openManageSubscriptions).toHaveBeenCalled();
    });
  });

  describe("BillingScreen Component Rendering", () => {
    it("renders Free tier paywall with benefits, plan cards, and legal disclosure", () => {
      const h = hookHarness();
      const { BillingScreen } = loadBillingScreen(h.react);

      const billingApi = createMockBillingApi(freeResponse);
      const purchaseAdapter = createMockPurchaseAdapter();
      const onBack = vi.fn();

      const tree = h.render(() =>
        BillingScreen({
          householdId,
          billingApi,
          purchaseAdapter,
          initialSubscription: freeResponse,
          onBack,
        }),
      );

      const renderedText = text(tree);
      expect(renderedText).toContain("Family Fund Plus");
      expect(renderedText).toContain("Everything in Free, plus room to grow");
      expect(renderedText).toContain("4 connected bank accounts (1 in Free)");
      expect(renderedText).toContain(
        "2 investment broker accounts (0 in Free)",
      );
      expect(renderedText).toContain("On-device companion with local privacy");
      expect(renderedText).toContain("Save 16%");
      expect(renderedText).toContain("Subscribe for £49.99");
      expect(renderedText).toContain("Restore existing purchases");
      expect(renderedText).toContain(
        "Payment is charged to your store account upon confirmation.",
      );

      // Check accessible radio buttons
      const radios = elements(tree).filter(
        (e) => e.props.accessibilityRole === "radio",
      );
      expect(radios).toHaveLength(2);
      expect(radios[0]?.props.accessibilityState).toEqual({ selected: false }); // monthly
      expect(radios[1]?.props.accessibilityState).toEqual({ selected: true }); // annual (default)
    });

    it("renders Active Plus state with ACTIVE PLUS badge and renewal date", () => {
      const h = hookHarness();
      const { BillingScreen } = loadBillingScreen(h.react);

      const billingApi = createMockBillingApi(activePlusResponse);
      const purchaseAdapter = createMockPurchaseAdapter();

      const tree = h.render(() =>
        BillingScreen({
          householdId,
          billingApi,
          purchaseAdapter,
          initialSubscription: activePlusResponse,
        }),
      );

      const renderedText = text(tree);
      expect(renderedText).toContain("ACTIVE PLUS");
      expect(renderedText).toContain("Your household is on Family Fund Plus");
      expect(renderedText).toContain("Annual billing plan");
      expect(renderedText).toContain("Manage subscription");
      expect(renderedText).toContain("Restore purchases");
    });

    it("renders alert notice with accessibilityRole='alert' when statusNotice is set", async () => {
      const h = hookHarness();
      const { BillingScreen } = loadBillingScreen(h.react);

      const billingApi = createMockBillingApi(freeResponse);
      const purchaseAdapter = createMockPurchaseAdapter({
        purchase: vi.fn(async () => ({
          kind: "error" as const,
          message: "Network unavailable.",
        })),
      });

      let tree = h.render(() =>
        BillingScreen({
          householdId,
          billingApi,
          purchaseAdapter,
          initialSubscription: freeResponse,
        }),
      );

      const subscribeBtn = elements(tree).find(
        (e) => e.type === "action" && e.props.label === "Subscribe for £49.99",
      );
      expect(subscribeBtn).toBeDefined();

      // Trigger purchase
      await (subscribeBtn?.props.onPress as () => Promise<void>)();

      tree = h.render(() =>
        BillingScreen({
          householdId,
          billingApi,
          purchaseAdapter,
          initialSubscription: freeResponse,
        }),
      );

      const alert = elements(tree).find(
        (e) => e.props.accessibilityRole === "alert",
      );
      expect(alert).toBeDefined();
      expect(text(alert)).toContain("Network unavailable.");
    });
  });
});
