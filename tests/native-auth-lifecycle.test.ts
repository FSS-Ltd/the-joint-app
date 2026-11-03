import { IdentityMutations } from "../apps/mobile/src/features/identity/mutations.js";
import { expect, it, vi } from "vitest";
import {
  sourceExports,
  hookHarness,
} from "./fixtures/native-source-harness.js";
import { NativeWorkflow } from "../apps/mobile/src/features/identity/workflow.js";
import * as shared from "../packages/identity-runtime/src/clerk-flow.js";
type Flow = {
  stage: import("../apps/mobile/src/features/identity/workflow.js").NativeAuthStage;
  resendReady: boolean;
  submit(
    email: string,
    password: string,
    code: string,
    backup: boolean,
    username: string,
  ): Promise<boolean>;
  resend(): Promise<boolean>;
};
function fixture() {
  const workflow = new NativeWorkflow();
  const send = vi.fn(async () => ({ error: null }));
  const verify = vi.fn<(input: { code: string }) => Promise<{ error: null }>>(
    async () => ({ error: null }),
  );
  const created = { id: "created", user: { id: "user" }, status: "active" };
  const clerk: {
    session: null | { id: string };
    client: { sessions: { id: string }[]; reload(): Promise<void> };
  } = {
    session: null,
    client: { sessions: [created], reload: async () => {} },
  };
  const mutations = new IdentityMutations({
    current: () => clerk.session,
    find: (id) => (id === created.id ? created : undefined),
    select: async () => {},
    block: () => {},
    settle: async () => {},
  });
  const finalize = vi.fn(async () => {
    clerk.session = created;
    mutations.observe(created);
    return { error: null };
  });
  const signUp = {
    id: "signup1",
    createdSessionId: "created",
    status: "missing_requirements",
    unverifiedFields: ["email_address"],
    missingFields: [],
    verifications: { sendEmailCode: send, verifyEmailCode: verify },
    finalize,
  };
  const signIn = {
    id: "signin1",
    createdSessionId: "created",
    status: "needs_first_factor",
    supportedSecondFactors: [],
    resetPasswordEmailCode: { sendCode: send, verifyCode: verify },
    create: vi.fn(async () => ({ error: null })),
    finalize,
  };
  function mount(mode: "sign-up" | "recovery") {
    const harness = hookHarness();
    const exports = sourceExports(
      "apps/mobile/src/features/identity/use-auth-flow.ts",
      {
        react: harness.react,
        "@clerk/expo": {
          useClerk: () => clerk,
          useSignIn: () => ({ signIn, fetchStatus: "idle" }),
          useSignUp: () => ({ signUp, fetchStatus: "idle" }),
        },
        "@joint/identity-runtime": shared,
        "./context": { useIdentity: () => ({ workflow, mutations }) },
      },
    );
    // Source executes above; this assertion types its known exported hook.
    const hook = exports.useNativeAuthFlow as (
      mode: "sign-up" | "recovery",
    ) => Flow;
    return {
      render: () => harness.render(() => hook(mode)),
      unmount: harness.unmount,
    };
  }
  return {
    send,
    verify,
    finalize,
    signIn,
    signUp,
    clerk,
    mount,
    workflow,
    mutations,
  };
}
it("does not implicitly send a verification email on mount or after an inbox remount", async () => {
  const f = fixture(),
    first = f.mount("sign-up");
  first.render();
  await Promise.resolve();
  await Promise.resolve();
  first.unmount();
  const second = f.mount("sign-up");
  second.render();
  await Promise.resolve();
  await Promise.resolve();
  expect(f.send).not.toHaveBeenCalled();
  second.unmount();
});
it("does not send a recovery email after its screen is concealed", async () => {
  const f = fixture();
  let resolve: (() => void) | undefined;
  f.signIn.create.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = () => done({ error: null });
      }),
  );
  const screen = f.mount("recovery"),
    flow = screen.render();
  const pending = flow.submit("synthetic@example.test", "", "", false, "");
  screen.unmount();
  f.workflow.conceal();
  resolve?.();
  await pending;
  expect(f.send).not.toHaveBeenCalled();
  const resumed = f.mount("recovery");
  expect(resumed.render().stage).toEqual({
    step: "email-request",
    kind: "recovery",
  });
  resumed.unmount();
});
it.each(["sign-up", "recovery"] as const)(
  "resumes %s code entry with the same code and cooldown after inbox switch",
  async (mode) => {
    const f = fixture(),
      first = f.mount(mode);
    await first.render().submit("synthetic@example.test", "", "", false, "");
    expect(f.send).toHaveBeenCalledTimes(1);
    first.unmount();
    f.workflow.conceal();
    const resumed = f.mount(mode);
    let flow = resumed.render();
    expect(flow.stage).toEqual({
      step: "email",
      kind: mode === "sign-up" ? "signup" : "recovery",
    });
    expect(flow.resendReady).toBe(false);
    await flow.resend();
    expect(f.send).toHaveBeenCalledTimes(1);
    f.verify.mockImplementationOnce(async () => {
      if (mode === "sign-up") f.signUp.status = "complete";
      else f.signIn.status = "needs_new_password";
      return { error: null };
    });
    flow = resumed.render();
    await flow.submit("", "", "123456", false, "");
    expect(f.verify).toHaveBeenCalledWith({ code: "123456" });
    expect(f.send).toHaveBeenCalledTimes(1);
    resumed.unmount();
  },
);
it("does not finalize a late verification or auto-finalize its completed attempt on remount", async () => {
  const f = fixture(),
    first = f.mount("sign-up");
  await first.render().submit("", "", "", false, "");
  let resolve: (() => void) | undefined;
  f.verify.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = () => {
          f.signUp.status = "complete";
          done({ error: null });
        };
      }),
  );
  const pending = first.render().submit("", "", "123456", false, "");
  first.unmount();
  f.workflow.conceal();
  resolve?.();
  await pending;
  const resumed = f.mount("sign-up");
  expect(resumed.render().stage.step).toBe("complete");
  await Promise.resolve();
  expect(f.finalize).not.toHaveBeenCalled();
  await resumed.render().submit("", "", "", false, "");
  expect(f.finalize).toHaveBeenCalledOnce();
  resumed.unmount();
});
it("keeps an already-started finalize locked through concealment and quarantines a conflicting actor", async () => {
  const f = fixture();
  f.signUp.status = "complete";
  let resume: (() => void) | undefined;
  f.finalize.mockImplementationOnce(async () => {
    await new Promise<void>((done) => {
      resume = done;
    });
    f.clerk.session = { id: "created" };
    f.mutations.observe(f.clerk.session);
    return { error: null };
  });
  const first = f.mount("sign-up"),
    pending = first.render().submit("", "", "", false, "");
  expect(f.finalize).toHaveBeenCalledOnce();
  first.unmount();
  f.workflow.conceal();
  f.clerk.session = { id: "other" };
  f.mutations.observe(f.clerk.session);
  f.workflow.identify("other:session");
  resume?.();
  await pending;
  expect(f.mutations.getSnapshot().quarantined).toBe(true);
  expect(f.clerk.session?.id).toBe("created");
});
it("does not overlap a new recovery attempt after the first screen remounts", async () => {
  const f = fixture();
  let resolve: (() => void) | undefined;
  f.signIn.create.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = () => done({ error: null });
      }),
  );
  const first = f.mount("recovery"),
    pending = first.render().submit("first@example.test", "", "", false, "");
  first.unmount();
  f.workflow.conceal();
  const second = f.mount("recovery");
  await second.render().submit("second@example.test", "", "", false, "");
  expect(f.signIn.create).toHaveBeenCalledOnce();
  resolve?.();
  await pending;
  expect(f.send).not.toHaveBeenCalled();
  second.unmount();
});
