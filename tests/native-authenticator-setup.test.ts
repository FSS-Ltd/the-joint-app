import { expect, it, vi } from "vitest";
import { getTotpSetupUri } from "../packages/identity-runtime/src/totp-setup.js";
import {
  elements,
  hookHarness,
  jsxBoundary,
  press,
  sourceExports,
} from "./fixtures/native-source-harness.js";

const secret = "SYNTHETICKEY";
const uri = `otpauth://totp/sample?secret=${secret}`;
function mount(setupUri: string | null = uri, pending = false) {
  const hooks = hookHarness();
  const onOpen = vi.fn();
  const Enrollment = sourceExports(
    "apps/mobile/src/features/identity/authenticator-enrollment.tsx",
    {
      react: hooks.react,
      "react/jsx-runtime": jsxBoundary,
      "@joint/identity-runtime": { getTotpSetupUri },
      "@/components/app-text": { AppText: "text" },
      "@/components/native-action": { NativeAction: "action" },
      "@/components/native-actions": { NativeActions: "actions" },
      "./authenticator-qr-code": { AuthenticatorQrCode: "qr" },
    },
  ).AuthenticatorEnrollment as (props: unknown) => unknown;
  return {
    onOpen,
    render: () =>
      hooks.render(() =>
        Enrollment({ setup: { secret, uri: setupUri }, pending, onOpen }),
      ),
  };
}

it("hides the manual key until requested and opens only after an explicit press", () => {
  const screen = mount();
  const first = screen.render();
  expect(screen.onOpen).not.toHaveBeenCalled();
  expect(elements(first).some((item) => item.props.selectable)).toBe(false);
  expect(elements(first).find((item) => item.type === "qr")?.props.value).toBe(
    uri,
  );
  press(first, "Open authenticator");
  expect(screen.onOpen).toHaveBeenCalledExactlyOnceWith(uri);
  press(screen.render(), "Show private setup key");
  const manual = elements(screen.render()).find(
    (item) => item.props.selectable,
  );
  expect(manual?.props.children).toBe(secret);
  press(screen.render(), "Hide setup key");
  expect(elements(screen.render()).some((item) => item.props.selectable)).toBe(
    false,
  );
});

it.each([null, "https://example.test", `${uri}&secret=OTHER`])(
  "keeps manual setup available for invalid or missing URI case %#",
  (value) => {
    const screen = mount(value);
    const first = elements(screen.render());
    expect(first.some((item) => item.type === "qr")).toBe(false);
    expect(
      first.some((item) => item.props.label === "Open authenticator"),
    ).toBe(false);
    press(screen.render(), "Show private setup key");
    expect(
      elements(screen.render()).find((item) => item.props.selectable)?.props
        .children,
    ).toBe(secret);
    expect(screen.onOpen).not.toHaveBeenCalled();
  },
);

it("disables the handoff during an in-flight operation", () => {
  const screen = mount(uri, true);
  const open = elements(screen.render()).find(
    (item) => item.props.label === "Open authenticator",
  );
  expect(open?.props.pending).toBe(true);
});

it("shows fixed manual fallback text when the QR encoder cannot produce a graphic", () => {
  const Qr = sourceExports(
    "apps/mobile/src/features/identity/authenticator-qr-code.tsx",
    {
      react: { useMemo: (factory: () => unknown) => factory() },
      "react/jsx-runtime": jsxBoundary,
      "react-native": { View: "view" },
      "react-native-svg": { default: "svg", Path: "path", Rect: "rect" },
      "@/components/app-text": { AppText: "text" },
      "./qr-code-path": { createQrCodePath: () => null },
    },
  ).AuthenticatorQrCode as (props: { value: string }) => unknown;
  const result = Qr({ value: uri });
  expect(JSON.stringify(result)).toContain("manual setup key");
  expect(JSON.stringify(result)).not.toContain(uri);
  expect(elements(result).some((item) => item.type === "svg")).toBe(false);
});
