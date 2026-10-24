export interface WorkerScheduler {
  wake(): void;
  close(): Promise<void>;
}

/** One serialized catch-up per wake; idle time never queries durable state. */
export function createWorkerScheduler(
  cycle: () => Promise<number | null>,
  options: { retryMaxMs: number; onUnavailable?: () => void },
): WorkerScheduler {
  let stopped = false;
  let pending = false;
  let coolingDown = false;
  let active: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryMs = 1000;

  function schedule(delayMs: number): void {
    const deadline = performance.now() + Math.max(1, delayMs);
    const arm = (): void => {
      const remaining = deadline - performance.now();
      if (remaining <= 0) {
        coolingDown = false;
        wake();
      } else timer = setTimeout(arm, Math.min(remaining, 2147483647));
    };
    arm();
  }

  async function drain(): Promise<void> {
    while (pending && !stopped && !coolingDown) {
      pending = false;
      let delay: number | null;
      try {
        delay = await cycle();
        retryMs = 1000;
      } catch {
        options.onUnavailable?.();
        delay = retryMs;
        retryMs = Math.min(retryMs * 2, options.retryMaxMs);
        coolingDown = true;
        // A failing cycle must back off even if its writes emitted notifications.
        pending = false;
      }
      if (!stopped && !pending && delay !== null) {
        // SKIP LOCKED can leave overdue work visible without an acquirable row.
        // Cap that no-hint retry to one cycle/second, including later hints.
        if (delay === 0) {
          coolingDown = true;
          delay = 1000;
        }
        schedule(delay);
      }
    }
  }

  function wake(): void {
    if (stopped) return;
    pending = true;
    if (coolingDown) return;
    clearTimeout(timer);
    if (!active)
      active = drain().finally(() => {
        active = undefined;
        if (pending && !stopped && !coolingDown) wake();
      });
  }

  return {
    wake,
    async close(): Promise<void> {
      stopped = true;
      pending = false;
      clearTimeout(timer);
      await active;
    },
  };
}
