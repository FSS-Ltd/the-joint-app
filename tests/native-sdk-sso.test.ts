import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  nativeClerkHarness,
  deferred,
} from "./fixtures/native-clerk-harness.js";
import {
  hookHarness,
  sourceExports,
} from "./fixtures/native-source-harness.js";
import { IdentityMutations } from "../apps/mobile/src/features/identity/mutations.js";
import { NativeIdentityController } from "../apps/mobile/src/features/identity/controller.js";
import { sessionActor } from "../apps/mobile/src/features/identity/provider-session.js";
import { NativeReturnGuard } from "../apps/mobile/src/features/identity/returns.js";
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function fixture() {
  const f = await nativeClerkHarness();
  await f.clerk.setActive({ session: null });
  const readMe = vi.fn(async () => {
    throw { status: 401 };
  });
  const controller = new NativeIdentityController({
    readMe,
    readDeadline: async () => {
      throw Error();
    },
    recordActivity: async () => {
      throw Error();
    },
  });
  await controller.identify(null);
  const settle = vi.fn(() =>
    controller.settleMutation(sessionActor(f.clerk.session)),
  );
  const mutations = new IdentityMutations({
    current: () => f.clerk.session,
    find: (id) => f.clerk.client.signedInSessions.find((s) => s.id === id),
    select: (id) => f.clerk.setActive({ session: id }),
    block: () => controller.blockMutations(),
    settle,
  });
  const off = f.clerk.addListener(({ session }) => mutations.observe(session));
  const result = deferred<{
    authSessionResult: { type: string; url: string };
    createdSessionId: string;
  }>();
  const startSSOFlow = vi.fn(() => result.promise),
    h = hookHarness();
  const hook = sourceExports(
    "apps/mobile/src/features/identity/use-native-sso.ts",
    {
      react: h.react,
      "@clerk/expo": {
        useClerk: () => f.clerk,
        useSSO: () => ({ startSSOFlow }),
      },
      "expo-router": { useRouter: () => ({ replace: vi.fn() }) },
      "./returns": { NativeReturnGuard },
    },
  ).useNativeSso as (
    destination: string,
    mutations: IdentityMutations,
  ) => { start(): Promise<void>; pending: boolean; revision: number };
  const sso = h.render(() => hook("familyfund://auth-return", mutations));
  return {
    ...f,
    result,
    mutations,
    settle,
    controller,
    readMe,
    sso,
    close: () => {
      off();
      h.unmount();
      controller.dispose();
    },
  };
}
const successfulReturn = {
  authSessionResult: {
    type: "success",
    url: "familyfund://auth-return?rotating_token_nonce=synthetic",
  },
  createdSessionId: "a",
};
it("holds the shared coordinator throughout SSO and quarantines actual SDK late activation", async () => {
  const f = await fixture(),
    { mutations, result, settle, sso } = f;
  const running = sso.start();
  const attempt = vi.fn(async () => {});
  await expect(mutations.run(attempt)).rejects.toThrow();
  expect(attempt).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(16000);
  expect(mutations.getSnapshot()).toMatchObject({
    busy: true,
    quarantined: false,
  });
  const token = deferred<void>();
  f.delays.set("/v1/client/sessions/a/tokens", token.promise);
  result.resolve({
    authSessionResult: {
      type: "success",
      url: "familyfund://auth-return?rotating_token_nonce=synthetic",
    },
    createdSessionId: "a",
  });
  for (
    let i = 0;
    i < 100 && !f.calls.includes("/v1/client/sessions/a/tokens");
    i++
  )
    await Promise.resolve();
  expect(f.calls).toContain("/v1/client/sessions/a/tokens");
  await f.clerk.setActive({ session: "b" });
  token.resolve();
  await running;
  expect(f.clerk.session?.id).toBe("a");
  expect(mutations.getSnapshot()).toMatchObject({
    busy: false,
    quarantined: true,
  });
  expect(settle).not.toHaveBeenCalled();
  f.close();
});

it("accepts a normal delayed browser return while retaining the background mask until foreground reconciliation", async () => {
  const f = await fixture();
  const running = f.sso.start();
  f.controller.background();
  await vi.advanceTimersByTimeAsync(60000);
  expect(f.mutations.getSnapshot()).toMatchObject({
    busy: true,
    quarantined: false,
  });
  f.result.resolve(successfulReturn);
  await running;
  expect(f.clerk.session?.id).toBe("a");
  expect(f.mutations.getSnapshot()).toMatchObject({
    busy: false,
    quarantined: false,
  });
  expect(f.controller.getSnapshot()).toEqual({
    kind: "locked",
    reason: "background",
  });
  expect(f.readMe).not.toHaveBeenCalled();
  await f.controller.foreground();
  expect(f.readMe).toHaveBeenCalledOnce();
  expect(f.controller.getSnapshot()).toEqual({
    kind: "locked",
    reason: "expired",
  });
  f.close();
});
