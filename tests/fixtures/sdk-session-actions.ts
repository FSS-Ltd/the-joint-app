import { vi } from "vitest";
import { sourceExports, hookHarness } from "./native-source-harness.js";
import { createIdentityApi } from "./native-api.js";
import { NativeWorkflow } from "../../apps/mobile/src/features/identity/workflow.js";
import { CleanupStore } from "../../apps/mobile/src/features/identity/cleanup-store.js";
import * as logout from "../../apps/mobile/src/features/identity/logout.js";
import * as provider from "../../apps/mobile/src/features/identity/provider-session.js";
import type { NativeClerk } from "./clerk-sdk.js";
import type { IdentityMutations } from "../../apps/mobile/src/features/identity/mutations.js";
import type { NativeIdentityController } from "../../apps/mobile/src/features/identity/controller.js";
type Actions = ReturnType<
  typeof import("../../apps/mobile/src/features/identity/use-session-actions.js").useSessionActions
>;
export async function sdkSessionActions(
  clerk: NativeClerk,
  controller: NativeIdentityController,
  mutations: IdentityMutations,
) {
  const h = hookHarness(),
    workflow = new NativeWorkflow();
  workflow.identify(provider.sessionActor(clerk.session));
  const send = vi.fn<typeof fetch>(
    async () => new Response("Unauthorized", { status: 401 }),
  );
  const api = createIdentityApi(
    "https://app.test",
    async () => clerk.session?.getToken({ skipCache: true }) ?? null,
    send,
  );
  const hook = sourceExports(
    "apps/mobile/src/features/identity/use-session-actions.ts",
    {
      react: h.react,
      "@clerk/expo": {
        useClerk: () => clerk,
        useSession: () => ({ session: clerk.session }),
      },
      "expo-secure-store": {
        getItemAsync: async () => null,
        setItemAsync: async () => {},
        deleteItemAsync: async () => {},
      },
      "./cleanup-store": { CleanupStore },
      "./logout": logout,
      "./provider-session": provider,
      "./api": {
        createIdentityApi: (url: string, token: () => Promise<string | null>) =>
          createIdentityApi(url, token, send),
      },
    },
  ).useSessionActions as (...args: unknown[]) => Actions;
  const render = () =>
    h.render(() =>
      hook(
        "https://app.test",
        api,
        controller,
        workflow,
        controller.getSnapshot(),
        mutations,
      ),
    );
  render();
  await Promise.resolve();
  await Promise.resolve();
  return { render, send, api, unmount: h.unmount };
}
