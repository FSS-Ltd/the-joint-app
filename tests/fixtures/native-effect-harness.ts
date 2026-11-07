/** Hook emulation that honours effect dependencies and cleanup, unlike hookHarness. */
export function effectHarness() {
  const slots: unknown[] = [];
  const effects: { deps?: readonly unknown[]; cleanup?: () => void }[] = [];
  let index = 0;
  let effectIndex = 0;
  let first = true;
  let mounted = true;
  let pending: (() => void)[] = [];
  const react = {
    useState<T>(
      initial: T | (() => T),
    ): [T, (next: T | ((previous: T) => T)) => void] {
      const slot = index++;
      if (first)
        slots[slot] =
          typeof initial === "function" ? (initial as () => T)() : initial;
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
    useEffect(
      effect: () => void | (() => void),
      deps?: readonly unknown[],
    ): void {
      const slot = effectIndex++;
      const previous = effects[slot];
      const changed =
        !previous ||
        !deps ||
        !previous.deps ||
        deps.some((value, i) => !Object.is(value, previous.deps?.[i]));
      if (!changed) return;
      pending.push(() => {
        previous?.cleanup?.();
        const cleanup = effect();
        effects[slot] = { deps, ...(cleanup ? { cleanup } : {}) };
      });
    },
  };
  // Layout effects are ordered like effects in this emulation.
  Object.assign(react, { useLayoutEffect: react.useEffect });
  return {
    react,
    render<T>(hook: () => T): T {
      index = 0;
      effectIndex = 0;
      pending = [];
      const result = hook();
      first = false;
      for (const run of pending) run();
      return result;
    },
    unmount(): void {
      mounted = false;
      for (const effect of effects) effect?.cleanup?.();
    },
  };
}
