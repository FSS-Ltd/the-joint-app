import {
  NativeFinanceResourceMemory,
  observeFinanceResourceAuthority,
} from "../../apps/mobile/src/features/finance/resource-memory.js";
import { financeHooks } from "./native-finance-hooks.js";
import * as contracts from "../../packages/contracts/src/index.js";
import * as resultHelpers from "../../apps/mobile/src/features/finance/result.js";
import * as resourceScope from "../../apps/mobile/src/events/scope.js";
import type { NativeResourceScope } from "../../apps/mobile/src/events/scope.js";
import type {
  FinanceResourceResult,
  FinanceMutationResult,
} from "../../apps/mobile/src/features/finance/state.js";
import type { NativeFinanceContextValue } from "../../apps/mobile/src/features/finance/context.js";
import { vi } from "vitest";
import type { MeResponse } from "../../packages/contracts/src/identity.js";
import type { NativeIdentityBridge } from "../../apps/mobile/src/features/identity/bridge.js";
import { NativeIdentityController } from "../../apps/mobile/src/features/identity/controller.js";
import { NativeResourceController } from "./native-events.js";
import * as scopeHelpers from "../../apps/mobile/src/features/finance/scope.js";
import * as financeErrors from "../../apps/mobile/src/features/finance/errors.js";
import { nativeWire, scope } from "./native-stream.js";
import * as accountAdapters from "../../apps/mobile/src/api/accounts.js";
import * as wealthAdapters from "../../apps/mobile/src/api/wealth.js";
import * as transactionAdapters from "../../apps/mobile/src/api/transactions.js";
import * as importAdapters from "../../apps/mobile/src/api/imports.js";
import * as spendingAdapters from "../../apps/mobile/src/api/spending.js";
import * as goalsAdapters from "../../apps/mobile/src/api/goals.js";
import { jsxBoundary, sourceExports } from "./native-source-harness.js";

export const financeMe: MeResponse = {
  user: { id: scope.userId, email: "synthetic@example.test" },
  membership: {
    id: scope.membershipId,
    householdId: scope.householdId,
    role: "ADMIN",
    grantVersion: 0,
    household: {
      id: scope.householdId,
      name: "Synthetic",
      baseCurrency: "GBP",
      timezone: "Europe/London",
      memberCount: 1,
    },
  },
  session: {
    aal: "aal2",
    expiresAt: new Date(600000).toISOString(),
    needsMfa: false,
    mfaVerifiedAt: null,
    purpose: "NORMAL",
  },
  factors: [],
};

export async function financeFixture(getToken?: () => Promise<string>) {
  const wire = nativeWire(getToken);
  const api = {
    readMe: vi.fn(async () => structuredClone(financeMe)),
    readDeadline: vi.fn(async () => ({
      expiresAt: new Date(600000).toISOString(),
      serverTime: new Date().toISOString(),
    })),
    recordActivity: vi.fn(async () => ({
      expiresAt: new Date(600000).toISOString(),
      serverTime: new Date().toISOString(),
    })),
  };
  const controller = new NativeIdentityController(api);
  await controller.identify(scope.actor);
  const identity: NativeIdentityBridge = {
    transport: wire.transport,
    resources: new NativeFinanceResourceMemory(),
    getVerifiedIdentity: controller.getVerifiedIdentity,
    subscribe: controller.subscribe,
    revoke: (actor) => controller.revoke(actor),
    refresh: () => controller.refresh(),
  };
  const stopResources = observeFinanceResourceAuthority(
    controller,
    identity.resources,
  );
  const mounted = new Set<() => void>();
  const mount = () => {
    const initialMe = controller.getVerifiedIdentity()!.me;
    const providerHarness = financeHooks();
    const provider = sourceExports(
      "apps/mobile/src/features/finance/provider.tsx",
      {
        react: {
          ...providerHarness.react,
          createContext: () => ({ Provider: "finance" }),
          useContext: () => null,
        },
        "react/jsx-runtime": jsxBoundary,
        "../identity/context": { useIdentity: () => ({ finance: identity }) },
        "../../api/accounts": accountAdapters,
        "../../api/wealth": wealthAdapters,
        "../../api/transactions": transactionAdapters,
        "../../api/imports": importAdapters,
        "../../api/spending": spendingAdapters,
        "../../api/goals": goalsAdapters,
        "./scope": scopeHelpers,
        "./context": { FinanceContext: { Provider: "finance" } },
      },
    ).NativeFinanceProvider as (props: { me: MeResponse }) => unknown;
    const renderProvider = (me: MeResponse = initialMe) => {
      const element = providerHarness.render(() => provider({ me }));
      // The explicit JSX boundary preserves the authored provider's real value.
      return (
        element as unknown as { props: { value: NativeFinanceContextValue } }
      ).props.value;
    };
    const value = renderProvider();
    if (!value.authority)
      throw new Error("Fixture requires verified authority");
    const finance = { ...value, authority: value.authority };
    let currentFinance = finance;
    const h = financeHooks();
    const dependencies = {
      "@joint/contracts": contracts,
      "../../events/scope": resourceScope,
      react: h.react,
      "react-native": { AppState: h.appState },
      "expo-router": h.router,
      "./context": { useNativeFinance: () => currentFinance },
      "./scope": scopeHelpers,
      "./result": resultHelpers,
      "./errors": financeErrors,
      "../../events/resource": { NativeResourceController },
    };
    const lifetime = sourceExports(
      "apps/mobile/src/features/finance/use-lifetime.ts",
      dependencies,
    );
    Object.assign(dependencies, { "./use-lifetime": lifetime });
    const resource = sourceExports(
      "apps/mobile/src/features/finance/use-resource.ts",
      dependencies,
    ).useFinanceResource as <T>(
      selector: NativeResourceScope["selector"],
      read: (scope: NativeResourceScope, signal: AbortSignal) => Promise<T>,
    ) => FinanceResourceResult<T>;
    const mutation = sourceExports(
      "apps/mobile/src/features/finance/use-mutation.ts",
      dependencies,
    ).useFinanceMutation as <T>(target: string) => FinanceMutationResult<T>;
    const unmount = () => {
      h.unmount();
      mounted.delete(unmount);
    };
    mounted.add(unmount);
    return {
      h,
      get finance() {
        return currentFinance;
      },
      replaceFinance(value: typeof finance) {
        currentFinance = value;
      },
      renderProvider,
      resource,
      mutation,
      close: unmount,
    };
  };
  const first = mount();
  return {
    ...wire,
    ...first,
    get finance() {
      return first.finance;
    },
    controller,
    api,
    mount,
    identity,
    // Synthetic provenance for existing tests that begin after a prior authorized page.
    issueCursor(cursor: string) {
      identity.resources.success(scope, { items: [], nextCursor: cursor });
    },
    close() {
      mounted.forEach((unmount) => unmount());
      stopResources();
      controller.dispose();
    },
  };
}
