import { readFileSync } from "node:fs";
import ts from "typescript";

/** Execute the authored hook/screen with explicit React/SDK boundaries, without a native renderer. */
export function sourceExports(
  path: string,
  dependencies: Record<string, unknown>,
): Record<string, unknown> {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const result: Record<string, unknown> = {};
  const requireDependency = (name: string): unknown => {
    if (!(name in dependencies))
      throw new Error(`Missing test dependency: ${name}`);
    return dependencies[name];
  };
  new Function("require", "exports", compiled)(requireDependency, result);
  return result;
}
export function hookHarness() {
  const slots: unknown[] = [];
  const cleanups: (() => void)[] = [];
  let index = 0,
    first = true,
    mounted = true;
  const effects: (() => void | (() => void))[] = [];
  const react = {
    useState<T>(
      initial: T | (() => T),
    ): [T, (next: T | ((previous: T) => T)) => void] {
      const slot = index++;
      if (first)
        slots[slot] =
          typeof initial === "function" ? (initial as () => T)() : initial;
      // React's heterogeneous hook slots are typed by each call site in this test boundary.
      return [
        slots[slot] as T,
        (next) => {
          if (mounted)
            slots[slot] =
              typeof next === "function"
                ? (next as (value: T) => T)(slots[slot] as T)
                : next;
        },
      ];
    },
    useRef<T>(initial: T): { current: T } {
      const slot = index++;
      if (first) slots[slot] = { current: initial };
      return slots[slot] as { current: T };
    },
    useMemo<T>(factory: () => T): T {
      const slot = index++;
      if (first) slots[slot] = factory();
      return slots[slot] as T;
    },
    useCallback<T>(callback: T): T {
      const slot = index++;
      if (first) slots[slot] = callback;
      return slots[slot] as T;
    },
    useLayoutEffect(effect: () => void | (() => void)): void {
      if (first) effects.push(effect);
    },
    useEffect(effect: () => void | (() => void)): void {
      if (first) effects.push(effect);
    },
    useSyncExternalStore<T>(_subscribe: unknown, getSnapshot: () => T): T {
      return getSnapshot();
    },
  };
  return {
    react,
    render<T>(hook: () => T): T {
      index = 0;
      const result = hook();
      if (first) {
        first = false;
        for (const effect of effects) {
          const cleanup = effect();
          if (cleanup) cleanups.push(cleanup);
        }
      }
      return result;
    },
    unmount(): void {
      mounted = false;
      for (const cleanup of cleanups) cleanup();
    },
  };
}

export type TestElement = { type: unknown; props: Record<string, unknown> };
export const jsxBoundary = {
  jsx: (type: unknown, props: Record<string, unknown>): TestElement => ({
    type,
    props,
  }),
  jsxs: (type: unknown, props: Record<string, unknown>): TestElement => ({
    type,
    props,
  }),
  Fragment: "Fragment",
};
export function elements(tree: unknown): TestElement[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  // The JSX boundary above is the only producer of test element objects.
  const element = tree as TestElement;
  return [element, ...elements(element.props.children)];
}
export function field(
  tree: unknown,
  label: string,
): { value: unknown; onChangeText: (value: string) => void } {
  const element = elements(tree).find((item) => item.props.label === label);
  if (!element) throw new Error(`Missing field: ${label}`);
  return element.props as {
    value: unknown;
    onChangeText: (value: string) => void;
  };
}
export function press(tree: unknown, label: string): void {
  const element = elements(tree).find((item) => item.props.label === label);
  if (!element || typeof element.props.onPress !== "function")
    throw new Error(`Missing action: ${label}`);
  element.props.onPress();
}
