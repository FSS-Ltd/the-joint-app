import { expect, it, vi } from "vitest";
import {
  sourceExports,
  hookHarness,
  jsxBoundary,
  elements,
  field,
  press,
} from "./fixtures/native-source-harness.js";
import { NativeWorkflow } from "../apps/mobile/src/features/identity/workflow.js";
import * as shared from "../packages/identity-runtime/src/clerk-flow.js";
import { passwordResetSchema } from "../packages/contracts/src/index.js";
type Operation = {
  pending: boolean;
  error: string;
  notice: string;
  setError(value: string): void;
  setNotice(value: string): void;
  run(
    action: (
      signal: AbortSignal,
      lifetime: { active(): boolean; current(): boolean },
    ) => Promise<void>,
  ): Promise<boolean>;
};
function fixture() {
  const workflow = new NativeWorkflow();
  workflow.identify("user:a");
  const user = {
    totpEnabled: false,
    createTOTP: vi.fn(async () => ({ secret: "synthetic-private-key" })),
    verifyTOTP: vi.fn<(value: { code: string }) => Promise<void>>(async () => {
      user.totpEnabled = true;
    }),
    reload: vi.fn(async () => {}),
    updatePassword: vi.fn(async () => {}),
  };
  const session = {
    reload: vi.fn(async () => {}),
    getToken: vi.fn(async () => "synthetic"),
  };
  const identity = {
    workflow,
    interact: () => {},
    refresh: vi.fn(async () => {}),
    api: { verifyTotp: vi.fn(async () => {}) },
  };
  let pending: Promise<boolean> | undefined;
  function mount(
    name: "SecurityScreen" | "PasswordTaskScreen" | "AccountScreen",
  ) {
    const h = hookHarness();
    const deps = {
      react: h.react,
      "react/jsx-runtime": jsxBoundary,
      "@joint/contracts": { passwordResetSchema },
      "@clerk/expo": {
        useUser: () => ({ user }),
        useClerk: () => ({ session }),
      },
      "./context": { useIdentity: () => identity },
      "@/components/app-text": { AppText: "text" },
      "@/components/identity-frame": {
        Feedback: "feedback",
        IdentityFrame: "frame",
      },
      "@/components/native-field": { NativeField: "field" },
      "@/components/native-action": { NativeAction: "action" },
      "@/components/native-actions": { NativeActions: "actions" },
      "./session-actions": { SessionActions: "sessions" },
      "./security-screen": { SecurityScreen: "security" },
      "./household-forms": {
        AcceptInvitation: "accept",
        CreateHousehold: "create",
        InviteAdult: "invite",
      },
    };
    const operation = sourceExports(
      "apps/mobile/src/features/identity/use-operation.ts",
      {
        ...deps,
        "./api": { IdentityApiError: Error, identityError: () => "error" },
        "@joint/identity-runtime": shared,
      },
    ).useIdentityOperation as () => Operation;
    const path =
      name === "SecurityScreen"
        ? "security-screen"
        : name === "PasswordTaskScreen"
          ? "password-task-screen"
          : "account-screen";
    const screen = sourceExports(
      `apps/mobile/src/features/identity/${path}.tsx`,
      {
        ...deps,
        "./use-operation": {
          useIdentityOperation: () => {
            const op = operation();
            return {
              ...op,
              run: (action: Parameters<Operation["run"]>[0]) => {
                pending = op.run(action);
                return pending;
              },
            };
          },
        },
      },
    )[name] as (props: unknown) => unknown;
    return {
      render: () =>
        h.render(() =>
          screen({
            me: { user: { email: "synthetic@example.test" }, membership: null },
          }),
        ),
      unmount: h.unmount,
    };
  }
  return { workflow, user, session, identity, mount, done: () => pending };
}
it("resumes pending authenticator verification after concealment without retaining the secret or code", async () => {
  const f = fixture(),
    first = f.mount("SecurityScreen");
  press(first.render(), "Set up authenticator");
  await f.done();
  field(first.render(), "Authenticator code").onChangeText("111111");
  press(first.render(), "Show private setup key");
  expect(JSON.stringify(first.render())).toContain("synthetic-private-key");
  first.unmount();
  f.workflow.conceal();
  const resumed = f.mount("SecurityScreen");
  expect(field(resumed.render(), "Authenticator code").value).toBe("");
  expect(JSON.stringify(resumed.render())).not.toContain(
    "synthetic-private-key",
  );
  field(resumed.render(), "Authenticator code").onChangeText("123456");
  press(resumed.render(), "Enable authenticator");
  await f.done();
  expect(f.user.createTOTP).toHaveBeenCalledOnce();
  expect(f.user.verifyTOTP).toHaveBeenCalledWith({ code: "123456" });
  expect(f.identity.api.verifyTotp).not.toHaveBeenCalled();
  resumed.unmount();
});
it("retains optional account-security navigation over concealment but clears it on actor change", () => {
  const f = fixture(),
    first = f.mount("AccountScreen");
  press(first.render(), "Account security");
  first.unmount();
  f.workflow.conceal();
  const resumed = f.mount("AccountScreen");
  expect(elements(resumed.render())[0]?.type).toBe("security");
  resumed.unmount();
  f.workflow.identify("other:b");
  const other = f.mount("AccountScreen");
  expect(elements(other.render())[0]?.type).toBe("frame");
  other.unmount();
});
it("does not refresh after password-session reload completes in the background", async () => {
  const f = fixture(),
    screen = f.mount("PasswordTaskScreen");
  let resolve: (() => void) | undefined;
  f.session.reload.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  field(screen.render(), "New password").onChangeText("synthetic-password-123");
  field(screen.render(), "Confirm password").onChangeText(
    "synthetic-password-123",
  );
  press(screen.render(), "Save password");
  await Promise.resolve();
  expect(f.session.reload).toHaveBeenCalledOnce();
  screen.unmount();
  f.workflow.conceal();
  resolve?.();
  await f.done();
  expect(f.identity.refresh).not.toHaveBeenCalled();
});
it("does not continue an old actor's enrollment after provider response", async () => {
  const f = fixture(),
    screen = f.mount("SecurityScreen");
  let resolve: (() => void) | undefined;
  f.user.createTOTP.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = () => done({ secret: "synthetic-private-key" });
      }),
  );
  press(screen.render(), "Set up authenticator");
  f.workflow.identify("other:b");
  resolve?.();
  await f.done();
  const next = f.mount("SecurityScreen");
  expect(
    elements(next.render()).some(
      (item) => item.props.label === "Set up authenticator",
    ),
  ).toBe(true);
  expect(JSON.stringify(screen.render())).not.toContain(
    "synthetic-private-key",
  );
  screen.unmount();
  next.unmount();
});
it("retains only pending enrollment metadata when creation resolves after background", async () => {
  const f = fixture(),
    screen = f.mount("SecurityScreen");
  let resolve: (() => void) | undefined;
  f.user.createTOTP.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = () => done({ secret: "synthetic-private-key" });
      }),
  );
  press(screen.render(), "Set up authenticator");
  screen.unmount();
  f.workflow.conceal();
  resolve?.();
  await f.done();
  const resumed = f.mount("SecurityScreen");
  expect(field(resumed.render(), "Authenticator code").value).toBe("");
  expect(JSON.stringify(resumed.render())).not.toContain(
    "synthetic-private-key",
  );
  expect(
    elements(resumed.render()).some(
      (item) => item.props.label === "Enable authenticator",
    ),
  ).toBe(true);
  resumed.unmount();
});
