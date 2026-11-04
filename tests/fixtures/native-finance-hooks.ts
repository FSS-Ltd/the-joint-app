/** Explicit React/navigation/AppState boundaries. Authored hooks and resource/transport run unchanged. */
export function financeHooks() {
  const slots: {
    value: unknown;
    deps?: readonly unknown[];
    cleanup?: () => void;
  }[] = [];
  let index = 0;
  let effects: (() => void)[] = [];
  const equal = (
    a: readonly unknown[] | undefined,
    b: readonly unknown[] | undefined,
  ) =>
    !!a &&
    !!b &&
    a.length === b.length &&
    a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState<T>(
      initial: T | (() => T),
    ): [T, (next: T | ((previous: T) => T)) => void] {
      const i = index++;
      slots[i] ??= {
        value: typeof initial === "function" ? (initial as () => T)() : initial,
      };
      return [
        slots[i].value as T,
        (next) => {
          slots[i]!.value =
            typeof next === "function"
              ? (next as (previous: T) => T)(slots[i]!.value as T)
              : next;
        },
      ];
    },
    useRef<T>(initial: T): { current: T } {
      const i = index++;
      slots[i] ??= { value: { current: initial } };
      return slots[i].value as { current: T };
    },
    useMemo<T>(factory: () => T, deps: readonly unknown[]): T {
      const i = index++;
      if (!slots[i] || !equal(slots[i].deps, deps))
        slots[i] = { value: factory(), deps };
      return slots[i].value as T;
    },
    useCallback<T>(callback: T, deps: readonly unknown[]): T {
      return react.useMemo(() => callback, deps);
    },
    useLayoutEffect(
      effect: () => void | (() => void),
      deps: readonly unknown[],
    ) {
      const i = index++;
      if (!slots[i] || !equal(slots[i].deps, deps)) {
        const previous = slots[i];
        slots[i] = { value: undefined, deps };
        effects.push(() => {
          previous?.cleanup?.();
          const cleanup = effect();
          if (cleanup) slots[i]!.cleanup = cleanup;
        });
      }
    },
    useSyncExternalStore<T>(_subscribe: unknown, get: () => T): T {
      return get();
    },
  };
  let focused = true;
  const focus = new Set<() => void | (() => void)>();
  const focusCleanups = new Map<() => void | (() => void), () => void>();
  const appListeners = new Set<(state: string) => void>();
  const appState = {
    currentState: "active",
    addEventListener(_name: string, listener: (state: string) => void) {
      appListeners.add(listener);
      return { remove: () => appListeners.delete(listener) };
    },
  };
  const router = {
    useIsFocused: () => focused,
    useFocusEffect(callback: () => void | (() => void)) {
      react.useLayoutEffect(() => {
        focus.add(callback);
        if (focused) {
          const cleanup = callback();
          if (cleanup) focusCleanups.set(callback, cleanup);
        }
        return () => {
          focusCleanups.get(callback)?.();
          focusCleanups.delete(callback);
          focus.delete(callback);
        };
      }, [callback]);
    },
  };
  return {
    react,
    appState,
    router,
    render<T>(render: () => T, commit = true): T {
      index = 0;
      const value = render();
      if (commit) {
        const next = effects;
        effects = [];
        next.forEach((effect) => effect());
      }
      return value;
    },
    focus(value: boolean) {
      focused = value;
      if (!value) {
        focusCleanups.forEach((cleanup) => cleanup());
        focusCleanups.clear();
      } else
        focus.forEach((callback) => {
          const cleanup = callback();
          if (cleanup) focusCleanups.set(callback, cleanup);
        });
    },
    app(value: string) {
      appState.currentState = value;
      appListeners.forEach((listener) => listener(value));
    },
    unmount() {
      slots.forEach((slot) => slot.cleanup?.());
    },
    listeners: () => appListeners.size,
  };
}
