import { expect, it, vi } from "vitest";
import {
  elements,
  field,
  hookHarness,
  press,
} from "./fixtures/native-source-harness.js";
import { load, text } from "./fixtures/native-read-ui.js";

function screen(stage: { step: string; kind?: string }, resendReady = false) {
  const hooks = hookHarness();
  const flow = {
    stage,
    pending: false,
    resendReady,
    backupAvailable: true,
    submit: vi.fn().mockResolvedValue(true),
    resend: vi.fn(),
    restart: vi.fn(),
  };
  const AuthScreen = load("identity/auth-screen.tsx", {
    react: hooks.react,
    "expo-router": { useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) },
    "@/components/identity-frame": {
      IdentityFrame: "frame",
      Feedback: "feedback",
    },
    "@/components/native-field": { NativeField: "field" },
    "./context": {
      useIdentity: () => ({ interact: vi.fn(), googlePending: false }),
    },
    "./use-auth-flow": { useNativeAuthFlow: () => flow },
  }).AuthScreen as (props: { mode: "sign-up" | "sign-in" }) => unknown;
  const render = (mode: "sign-up" | "sign-in" = "sign-up") =>
    hooks.render(() => AuthScreen({ mode }));
  return { flow, render };
}

it("groups signup verification actions with the accessible code field and retains cooldown", async () => {
  const { flow, render } = screen({ step: "email", kind: "signup" });
  let tree = render();
  const panel = elements(tree).find((element) => element.type === "view");
  expect(text(panel)).toContain("Authenticator setup is a separate step");
  expect(
    elements(panel).some((element) => element.props.label === "Verify email"),
  ).toBe(true);
  expect(
    elements(panel).find(
      (element) => element.props.label === "New code available shortly",
    )?.props.disabled,
  ).toBe(true);
  expect(field(tree, "Email verification code").value).toBe("");
  field(tree, "Email verification code").onChangeText("123456");
  tree = render();
  press(tree, "Verify email");
  await vi.waitFor(() =>
    expect(flow.submit).toHaveBeenCalledWith("", "", "123456", false, ""),
  );
  expect(flow.resend).not.toHaveBeenCalled();
});

it("keeps device email and authenticator verification distinct", () => {
  const device = screen({ step: "email", kind: "device" }, true);
  const deviceTree = device.render("sign-in");
  expect(elements(deviceTree)[0]?.props.title).toBe("Verify this sign-in.");
  press(deviceTree, "Send a new code");
  expect(device.flow.resend).toHaveBeenCalledOnce();
  expect(text(deviceTree)).not.toContain(
    "Authenticator setup is a separate step",
  );

  const mfa = screen({ step: "mfa" });
  let mfaTree = mfa.render("sign-in");
  expect(text(mfaTree)).toContain(
    "Enter the current code from your authenticator app.",
  );
  press(mfaTree, "Use a backup code");
  mfaTree = mfa.render("sign-in");
  expect(field(mfaTree, "Backup code").value).toBe("");
  expect(text(mfaTree)).not.toContain("Verify email");
});
