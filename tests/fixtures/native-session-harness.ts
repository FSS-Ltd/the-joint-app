import { IdentityMutations } from "../../apps/mobile/src/features/identity/mutations.js";
import { vi } from "vitest";
import { sourceExports, hookHarness } from "./native-source-harness.js";
import { NativeWorkflow } from "../../apps/mobile/src/features/identity/workflow.js";
import { NativeIdentityController } from "../../apps/mobile/src/features/identity/controller.js";
import { CleanupStore } from "../../apps/mobile/src/features/identity/cleanup-store.js";
import * as logoutHelpers from "../../apps/mobile/src/features/identity/logout.js";
import * as provider from "../../apps/mobile/src/features/identity/provider-session.js";
type Actions = ReturnType<
  typeof import("../../apps/mobile/src/features/identity/use-session-actions.js").useSessionActions
>;
export async function sessionFixture(
  status = 401,
  saved: string | null = null,
) {
  let disk = saved;
  const storage = {
    getItemAsync: vi.fn(async () => disk),
    setItemAsync: vi.fn(async (_key: string, value: string) => {
      disk = value;
    }),
    deleteItemAsync: vi.fn(async () => {
      disk = null;
    }),
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "device",
  };
  const original = {
    id: "a",
    user: { id: "user" },
    status: "active",
    getToken: vi.fn(async (): Promise<string | null> => "synthetic"),
    remove: vi.fn(async (): Promise<void> => {
      clerk.client.signedInSessions = clerk.client.signedInSessions.filter(
        (item) => item.id !== original.id,
      );
      if (clerk.session?.id === original.id) clerk.session = null;
      mutations.observe(clerk.session);
    }),
  };
  const clerk: {
    session: typeof original | null;
    client: { signedInSessions: Array<typeof original> };
    signOut: ReturnType<
      typeof vi.fn<(args: { sessionId: string }) => Promise<void>>
    >;
  } = {
    session: original,
    client: { signedInSessions: [original] },
    signOut: vi.fn(),
  };
  const api = {
    readMe: vi.fn(async () => {
      throw { status };
    }),
    readDeadline: vi.fn(async () => {
      throw Error();
    }),
    recordActivity: vi.fn(async () => {
      throw Error();
    }),
    retryLogoutCleanup: vi.fn<
      (ticket: string) => Promise<{
        state: string;
        providerCleanupPending?: boolean;
        providerCleanupToken?: string;
      }>
    >(async () => {
      throw { status };
    }),
  };
  const controller = new NativeIdentityController(api),
    workflow = new NativeWorkflow();
  const mutations = new IdentityMutations({
    current: () => clerk.session,
    find: (id) => clerk.client.signedInSessions.find((item) => item.id === id),
    select: async () => {
      clerk.session = null;
      mutations.observe(null);
    },
    block: () => controller.blockMutations(),
    settle: () =>
      controller.settleMutation(provider.sessionActor(clerk.session)),
  });
  await controller.identify("user:a");
  workflow.identify("user:a");
  const backend = vi.fn<
    (scope: "local" | "global") => Promise<{
      state: string;
      providerCleanupPending?: boolean;
      providerCleanupToken?: string;
    }>
  >(async () => {
    throw { status };
  });
  function mount() {
    const h = hookHarness();
    const hook = sourceExports(
      "apps/mobile/src/features/identity/use-session-actions.ts",
      {
        react: h.react,
        "@clerk/expo": {
          useClerk: () => clerk,
          useSession: () => ({ session: clerk.session }),
        },
        "expo-secure-store": storage,
        "./cleanup-store": { CleanupStore },
        "./logout": logoutHelpers,
        "./provider-session": provider,
        "./api": {
          createIdentityApi: (
            _url: string,
            getToken: () => Promise<string | null>,
          ) => ({
            logout: async (scope: "local" | "global") => {
              if (!(await getToken())) throw { status: 401 };
              return backend(scope);
            },
          }),
        },
      },
    ).useSessionActions as (...args: unknown[]) => Actions;
    const render = () =>
      h.render(() =>
        hook(
          "https://synthetic.test",
          api,
          controller,
          workflow,
          controller.getSnapshot(),
          mutations,
        ),
      );
    render();
    return { render, unmount: h.unmount };
  }
  const screen = mount();
  await Promise.resolve();
  await Promise.resolve();
  screen.render();
  return {
    api,
    backend,
    original,
    clerk,
    controller,
    workflow,
    mutations,
    storage,
    screen,
    mount,
    disk: () => disk,
  };
}
