import type { NativeResourceScope } from "../../apps/mobile/src/events/scope.js";
import type { FinanceResourceResult } from "../../apps/mobile/src/features/finance/state.js";
import type { NativeIdentityController } from "../../apps/mobile/src/features/identity/controller.js";
import type { MeResponse } from "../../packages/contracts/src/identity.js";
import {
  hookHarness,
  jsxBoundary,
  sourceExports,
} from "./native-source-harness.js";

/** Execute the complete authored gate; the caller commits ready-subtree removal when it returns a frame. */
export function financeGate(controller: NativeIdentityController) {
  const identity = {
    get state() {
      return controller.getSnapshot();
    },
    mutations: {
      subscribe: () => () => {},
      getSnapshot: () => ({ busy: false, quarantined: false, phase: "idle" }),
    },
    sessionPending: false,
  };
  return sourceExports("apps/mobile/src/features/identity/identity-entry.tsx", {
    react: hookHarness().react,
    "react/jsx-runtime": jsxBoundary,
    "@clerk/expo": { useSession: () => ({ session: null }) },
    "expo-router": { usePathname: () => "/accounts/retained-route" },
    "./context": { useIdentity: () => identity },
    "./mutation-screen": { MutationScreen: "mutation" },
    "./auth-screen": { AuthScreen: "auth" },
    "./security-screen": { SecurityScreen: "security" },
    "./password-task-screen": { PasswordTaskScreen: "password" },
    "./account-screen": { AccountScreen: "account" },
    "./session-actions": { SessionActions: "session" },
    "@/components/app-text": { AppText: "text" },
    "@/components/identity-frame": { IdentityFrame: "frame" },
    "@/components/native-action": { NativeAction: "action" },
    "@/components/native-actions": { NativeActions: "actions" },
  }).IdentityEntry as (props: { ready(me: MeResponse): string }) => unknown;
}

type FinanceFixture = Awaited<
  ReturnType<typeof import("./native-finance.js").financeFixture>
>;

export function gatedFinanceResource<T>(
  fixture: FinanceFixture,
  selector: () => NativeResourceScope["selector"],
  read: (scope: NativeResourceScope, signal: AbortSignal) => Promise<T>,
) {
  const gate = financeGate(fixture.controller);
  let mounted: ReturnType<FinanceFixture["mount"]> | null = null;
  let mounts = 0;
  let snapshot: FinanceResourceResult<T> | undefined;
  return {
    get mounts() {
      return mounts;
    },
    get snapshot() {
      return snapshot;
    },
    render() {
      const result = gate({
        ready: () => {
          if (!mounted) {
            mounted = fixture.mount();
            mounts++;
          }
          const screen = mounted;
          snapshot = screen.h.render(() => screen.resource(selector(), read));
          return "ready";
        },
      });
      if (result !== "ready" && mounted) {
        mounted.close();
        mounted = null;
      }
      return result;
    },
  };
}
