import { expect, it, vi } from "vitest";
import type { IdentityState } from "../apps/mobile/src/features/identity/controller.js";
import { financeMe } from "./fixtures/native-finance.js";
import {
  hookHarness,
  jsxBoundary,
  sourceExports,
} from "./fixtures/native-source-harness.js";

it.each(["/sign-up", "/home/accounts", "/more"])(
  "renders household setup at %s until membership is verified",
  (path) => {
    const me = { ...financeMe, membership: null };
    let state: IdentityState = { kind: "household-required", me };
    const ready = vi.fn(() => "workspace");
    const identity = {
      get state() {
        return state;
      },
      mutations: {
        subscribe: () => () => {},
        getSnapshot: () => ({ busy: false, quarantined: false }),
      },
      workflow: {
        subscribe: () => () => {},
        getSnapshot: () => 0,
        deletionReceipt: null,
      },
    };
    const Entry = sourceExports(
      "apps/mobile/src/features/identity/identity-entry.tsx",
      {
        react: hookHarness().react,
        "react/jsx-runtime": jsxBoundary,
        "@clerk/expo": { useSession: () => ({ session: null }) },
        "expo-router": { usePathname: () => path },
        "./context": { useIdentity: () => identity },
        "./mutation-screen": { MutationScreen: "mutation" },
        "./auth-screen": { AuthScreen: "auth" },
        "./security-screen": { SecurityScreen: "security" },
        "./password-task-screen": { PasswordTaskScreen: "password" },
        "./account-screen": { AccountScreen: "account" },
        "../privacy/deletion-receipt-screen": {
          DeletionReceiptScreen: "receipt",
        },
        "./session-actions": { SessionActions: "session" },
        "@/components/app-text": { AppText: "text" },
        "@/components/identity-frame": { IdentityFrame: "frame" },
        "@/components/native-action": { NativeAction: "action" },
        "@/components/native-actions": { NativeActions: "actions" },
      },
    ).IdentityEntry as (props: {
      ready: typeof ready;
    }) => { type: unknown; props: Record<string, unknown> } | string;
    expect(Entry({ ready })).toMatchObject({ type: "account", props: { me } });
    expect(ready).not.toHaveBeenCalled();
    state = { kind: "security-required", me };
    expect(Entry({ ready })).toMatchObject({ type: "security" });
    expect(ready).not.toHaveBeenCalled();
    state = { kind: "ready", me: financeMe };
    expect(Entry({ ready })).toBe("workspace");
    expect(ready).toHaveBeenCalledWith(financeMe);
  },
);
