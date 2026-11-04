import { expect, it, vi } from "vitest";
import { colors, spacing } from "../apps/mobile/src/theme/tokens.js";
import { elements } from "./fixtures/native-source-harness.js";
import { load } from "./fixtures/native-read-ui.js";

function flatten(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return Object.assign({}, ...value.map(flatten));
  return value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value))
    : {};
}

it("paints a rounded light selected pill, preserves selection/press semantics and keeps a 44pt target", () => {
  const Button = load("navigation/navigation-tab-button.tsx", {
    "react-native": {
      Pressable: "pressable",
      StyleSheet: { create: <T>(style: T) => style },
    },
    "@/theme/tokens": { colors, spacing },
  }).NavigationTabButton as (props: Record<string, unknown>) => {
    props: Record<string, unknown>;
  };
  const onPress = vi.fn(),
    onLongPress = vi.fn();
  for (const selected of [false, true]) {
    const tree = Button({
      "aria-selected": selected,
      "aria-label": "Home",
      onPress,
      onLongPress,
      children: "scalable router label",
      accessibilityState: { disabled: false },
      style: { borderRadius: 0, backgroundColor: "transparent" },
    });
    const style = flatten(
      (tree.props.style as (state: unknown) => unknown)({ pressed: false }),
    );
    expect(style.borderRadius).toBeGreaterThan(0);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.backgroundColor).toBe(selected ? colors.ivory : "transparent");
    expect(tree.props["aria-selected"]).toBe(selected);
    expect(tree.props.accessibilityState).toEqual({
      selected,
      disabled: false,
    });
    expect(tree.props.children).toBe("scalable router label");
    expect(tree.props["aria-label"]).toBe("Home");
    expect(tree.props.onPress).toBe(onPress);
    expect(tree.props.onLongPress).toBe(onLongPress);
  }
});

it("uses the native selected button and reserves safe navigation space as labels enlarge", () => {
  let fontScale = 1;
  const tabs = Object.assign("tabs", { Screen: "tab" });
  const Workspace = load("navigation/workspace-layout.tsx", {
    "expo-router": { Tabs: tabs },
    "react-native": { useWindowDimensions: () => ({ fontScale }) },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
    },
    "@/theme/tokens": { colors, spacing },
    "../identity/configured-entry": { ConfiguredEntry: "gate" },
    "../finance/provider": { NativeFinanceProvider: "finance" },
    "./navigation-tab-button": { NavigationTabButton: "native-tab-button" },
  }).WorkspaceLayout as () => unknown;
  const options = () => {
    const gate = elements(Workspace())[0]!;
    const ready = (
      gate.props.ready as (me: unknown) => {
        type: (props: unknown) => unknown;
        props: unknown;
      }
    )({});
    const tree = ready.type(ready.props);
    return elements(tree).find((e) => e.type === tabs)!.props.screenOptions as {
      tabBarButton: (props: unknown) => unknown;
      tabBarAllowFontScaling: boolean;
      tabBarStyle: { height: number; backgroundColor: string };
    };
  };
  const normal = options();
  expect(normal.tabBarAllowFontScaling).toBe(true);
  expect(normal.tabBarStyle.height).toBeGreaterThanOrEqual(44 + 34);
  expect(normal.tabBarStyle.backgroundColor).toBe(colors.forest);
  expect(
    elements(normal.tabBarButton({ "aria-selected": true }))[0],
  ).toMatchObject({
    type: "native-tab-button",
    props: { "aria-selected": true },
  });
  fontScale = 2.5;
  expect(options().tabBarStyle.height).toBeGreaterThan(
    normal.tabBarStyle.height,
  );
});
