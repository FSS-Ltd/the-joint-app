import { createContext, useContext } from "react";
import type { PrivacyApi } from "../../api/privacy";
import type { IdentityMutations } from "./mutations";
import type { NativeWorkflow } from "./workflow";
import type { IdentityApi } from "./api";
import type { IdentityState } from "./controller";

import type { NativeIdentityBridge } from "./bridge";
export type { NativeIdentityBridge } from "./bridge";

export type IdentityContextValue = {
  finance: NativeIdentityBridge;
  state: IdentityState;
  workflow: NativeWorkflow;
  mutations: IdentityMutations;
  api: IdentityApi;
  privacy?: PrivacyApi;
  refresh(): Promise<void>;
  interact(): void;
  logout(scope: "local" | "global"): Promise<void>;
  endRevokedSession?(notice?: string): Promise<void>;
  retryCleanup(): Promise<void>;
  cleanupPending: boolean;
  sessionPending: boolean;
  cancelPendingSignIn?: () => Promise<void>;
  sessionError: string;
  sessionNotice: string;
  discardRejectedSignIn?: () => Promise<void>;
  googlePending: boolean;
  authRevision: number;
  google?: () => Promise<void>;
  invitation: string | null;
  clearInvitation(): void;
};
export const IdentityContext = createContext<IdentityContextValue | null>(null);
export function useIdentity(): IdentityContextValue {
  const value = useContext(IdentityContext);
  if (!value) throw new Error("Identity provider is required.");
  return value;
}
