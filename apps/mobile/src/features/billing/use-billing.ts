import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BillingInterval,
  HouseholdSubscriptionResponse,
  NativeProduct,
  SubscriptionDto,
} from "@joint/contracts";
import type { BillingApi } from "../../api/billing";
import {
  createPlatformPurchaseAdapter,
  DEFAULT_NATIVE_PRODUCTS,
  type PlatformPurchaseAdapter,
} from "./purchase-adapter";

export interface StatusNotice {
  readonly text: string;
  readonly tone: "info" | "success" | "warning" | "error";
}

export interface UseBillingOptions {
  readonly householdId: string;
  readonly billingApi: BillingApi;
  readonly purchaseAdapter?: PlatformPurchaseAdapter;
  readonly initialSubscription?: HouseholdSubscriptionResponse | null;
  readonly onSubscriptionUpdated?: () => void;
}

export function useBilling({
  householdId,
  billingApi,
  purchaseAdapter,
  initialSubscription,
  onSubscriptionUpdated,
}: UseBillingOptions) {
  const adapter = useMemo(
    () => purchaseAdapter ?? createPlatformPurchaseAdapter(),
    [purchaseAdapter],
  );

  const [loading, setLoading] = useState(initialSubscription === undefined);
  const [subscription, setSubscription] = useState<SubscriptionDto | null>(
    initialSubscription?.subscription ?? null,
  );
  const [plan, setPlan] = useState<"FREE" | "PLUS">(
    initialSubscription?.plan ?? "FREE",
  );
  const [effectiveUntil, setEffectiveUntil] = useState<string | null>(
    initialSubscription?.effectiveUntil ?? null,
  );
  const [products, setProducts] = useState<readonly NativeProduct[]>(
    DEFAULT_NATIVE_PRODUCTS,
  );
  const [selectedInterval, setSelectedInterval] =
    useState<BillingInterval>("ANNUAL");
  const [purchasePending, setPurchasePending] = useState(false);
  const [restorePending, setRestorePending] = useState(false);
  const [statusNotice, setStatusNotice] = useState<StatusNotice | null>(null);
  const [storeAvailable, setStoreAvailable] = useState(true);

  const loadSubscription = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response: HouseholdSubscriptionResponse =
          await billingApi.getSubscription(householdId, signal);
        setSubscription(response.subscription);
        setPlan(response.plan);
        setEffectiveUntil(response.effectiveUntil);
        return response;
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to load subscription details.";
        setStatusNotice({ text: message, tone: "error" });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [billingApi, householdId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const [available, prods] = await Promise.all([
        adapter.isAvailable(),
        adapter.getProducts(),
      ]);
      setStoreAvailable(available);
      setProducts(prods);
      await loadSubscription(controller.signal);
    })();
    return () => controller.abort();
  }, [adapter, loadSubscription]);

  const selectedProduct =
    products.find((p) => p.interval === selectedInterval) ?? products[0];

  const isPlusActive = plan === "PLUS";

  const purchase = useCallback(async () => {
    if (!selectedProduct) return;
    if (isPlusActive) {
      setStatusNotice({
        text: "Your household already has an active Plus subscription.",
        tone: "info",
      });
      return;
    }
    if (!storeAvailable) {
      setStatusNotice({
        text: "In-app purchases are disabled on this device. Please check your Screen Time or restriction settings.",
        tone: "warning",
      });
      return;
    }

    setPurchasePending(true);
    setStatusNotice(null);

    try {
      const result = await adapter.purchase(selectedProduct.id, householdId);

      if (result.kind === "canceled") {
        // User voluntarily dismissed the store sheet. No error notice needed.
        return;
      }

      if (result.kind === "pending") {
        setStatusNotice({
          text: "Purchase pending authorization from family organizer or bank.",
          tone: "info",
        });
        return;
      }

      if (result.kind === "error") {
        setStatusNotice({ text: result.message, tone: "error" });
        return;
      }

      // Successful purchase; verify with backend
      setStatusNotice({
        text: "Purchase received. Synchronizing subscription...",
        tone: "info",
      });

      const updated = await loadSubscription();
      if (updated?.plan === "PLUS") {
        setStatusNotice({
          text: "Welcome to Family Fund Plus! Your household benefits are now active.",
          tone: "success",
        });
        onSubscriptionUpdated?.();
      } else {
        setStatusNotice({
          text: "Purchase confirmed. Your store receipt is being verified by the server.",
          tone: "info",
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Purchase could not be completed.";
      setStatusNotice({ text: message, tone: "error" });
    } finally {
      setPurchasePending(false);
    }
  }, [
    adapter,
    householdId,
    isPlusActive,
    loadSubscription,
    onSubscriptionUpdated,
    selectedProduct,
    storeAvailable,
  ]);

  const restore = useCallback(async () => {
    setRestorePending(true);
    setStatusNotice(null);

    try {
      const result = await adapter.restore(householdId);

      if (result.kind === "error") {
        setStatusNotice({ text: result.message, tone: "error" });
        return;
      }

      if (result.kind === "none_found") {
        setStatusNotice({
          text: "No active subscriptions found for this store account.",
          tone: "info",
        });
        return;
      }

      // Purchases found; reload subscription from server
      const updated = await loadSubscription();
      if (updated?.plan === "PLUS") {
        setStatusNotice({
          text: "Subscription successfully restored! Your Plus benefits are active.",
          tone: "success",
        });
        onSubscriptionUpdated?.();
      } else {
        setStatusNotice({
          text: "Restore receipt submitted. Entitlements are syncing.",
          tone: "info",
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unable to restore purchases.";
      setStatusNotice({ text: message, tone: "error" });
    } finally {
      setRestorePending(false);
    }
  }, [adapter, householdId, loadSubscription, onSubscriptionUpdated]);

  const manageSubscription = useCallback(async () => {
    try {
      await adapter.openManageSubscriptions();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to open subscription management.";
      setStatusNotice({ text: message, tone: "error" });
    }
  }, [adapter]);

  return {
    loading,
    subscription,
    plan,
    isPlusActive,
    effectiveUntil,
    products,
    selectedProduct,
    selectedInterval,
    setSelectedInterval,
    purchasePending,
    restorePending,
    statusNotice,
    clearStatusNotice: () => setStatusNotice(null),
    storeAvailable,
    purchase,
    restore,
    manageSubscription,
    refresh: loadSubscription,
  };
}
