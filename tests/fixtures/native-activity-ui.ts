import { vi } from "vitest";
import { elements, type TestElement } from "./native-source-harness.js";

/** Render function components too, so fields inside child components are visible. */
export function expand(tree: unknown): TestElement[] {
  return elements(tree).flatMap((element) =>
    typeof element.type === "function"
      ? [
          element,
          ...expand(
            (element.type as (props: unknown) => unknown)(element.props),
          ),
        ]
      : [element],
  );
}
export const byLabel = (tree: unknown, label: string) =>
  expand(tree).find((e) => e.props.label === label)?.props;
export function press(tree: unknown, label: string): void {
  const action = byLabel(tree, label);
  if (typeof action?.onPress !== "function")
    throw new Error(`Missing action: ${label}`);
  action.onPress();
}
/** A write session in its settled, editable state; override any field per test. */
export function session<D>(
  base: unknown,
  value: D,
  overrides: Record<string, unknown> = {},
) {
  return {
    read: { kind: "ready", value: base },
    draft: {
      base,
      value,
      message: "",
      visible: true,
      invalidated: false,
      change: vi.fn(),
      error: vi.fn(),
    },
    mutation: { kind: "idle" },
    allowed: true,
    editable: true,
    reload: vi.fn(),
    submit: vi.fn(),
    ...overrides,
  };
}
