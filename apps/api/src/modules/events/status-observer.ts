import type { StatusSignal } from "@joint/contracts";
export type { StatusSignal } from "@joint/contracts";
export interface StatusSnapshot {
  fingerprint: string;
  credentialExpiresAt: number;
  resourceExpiresAt: number | null;
  expiryEvent: "renew" | "invalidate";
}
export interface StatusEventSource {
  subscribe(wake: () => void, disconnect: () => void): () => void;
}
export interface StatusObserver {
  start(): void;
  close(): void;
}

/** Authorize before HTTP headers; subscribe first so concurrent commits cannot disappear. */
export async function authorizeStatusObserver(options: {
  source: StatusEventSource;
  read: () => Promise<StatusSnapshot>;
  send: (event: StatusSignal) => boolean;
  close: () => void;
  denied?: (error: unknown) => boolean;
  signal?: AbortSignal;
}): Promise<StatusObserver> {
  let closed = false;
  let started = false;
  let pending = false;
  let active: Promise<void> | undefined;
  let credentialTimer: ReturnType<typeof setTimeout> | undefined;
  let resourceTimer: ReturnType<typeof setTimeout> | undefined;
  let observedAt: number;
  let snapshot: StatusSnapshot;
  const unsubscribe = options.source.subscribe(wake, () => close("reconnect"));
  const abort = (): void => close();
  options.signal?.addEventListener("abort", abort, { once: true });

  function close(event?: StatusSignal): void {
    if (closed) return;
    closed = true;
    pending = false;
    clearTimeout(credentialTimer);
    clearTimeout(resourceTimer);
    unsubscribe();
    options.signal?.removeEventListener("abort", abort);
    if (started && event) options.send(event);
    options.close();
  }
  function emit(event: StatusSignal): void {
    if (!closed && !options.send(event)) close();
  }
  function schedule(): void {
    clearTimeout(credentialTimer);
    clearTimeout(resourceTimer);
    if (closed) return;
    const credentialDeadline = snapshot.credentialExpiresAt;
    const armCredential = (): void => {
      if (closed) return;
      const remaining = credentialDeadline - Date.now();
      if (remaining > 0)
        credentialTimer = setTimeout(
          armCredential,
          Math.min(remaining, 2147483647),
        );
      else close(snapshot.expiryEvent);
    };
    armCredential();
    const resourceDeadline = snapshot.resourceExpiresAt;
    // A deadline crossed during this read needs one catch-up read. A read
    // started after that deadline has already reconciled it, even if unchanged.
    if (closed || resourceDeadline === null || resourceDeadline <= observedAt)
      return;
    const armResource = (): void => {
      if (closed) return;
      const remaining = resourceDeadline - Date.now();
      if (remaining > 0)
        resourceTimer = setTimeout(
          armResource,
          Math.min(remaining, 2147483647),
        );
      else wake();
    };
    armResource();
  }
  function validate(value: StatusSnapshot): void {
    if (
      !Number.isFinite(value.credentialExpiresAt) ||
      (value.resourceExpiresAt !== null &&
        !Number.isFinite(value.resourceExpiresAt))
    )
      throw new Error("Subscription deadline unavailable");
  }
  async function drain(): Promise<void> {
    while (pending && !closed) {
      pending = false;
      try {
        const readStartedAt = Date.now();
        const next = await options.read();
        if (closed) return;
        validate(next);
        if (next.credentialExpiresAt <= Date.now()) {
          close(next.expiryEvent);
          return;
        }
        const changed = next.fingerprint !== snapshot.fingerprint;
        snapshot = next;
        observedAt = readStartedAt;
        if (changed) emit("change");
        schedule();
      } catch (error) {
        close(options.denied?.(error) ? "invalidate" : "reconnect");
      }
    }
  }
  function wake(): void {
    if (closed) return;
    pending = true;
    if (!started || active) return;
    active = drain().finally(() => {
      active = undefined;
      if (pending && !closed) wake();
    });
  }

  try {
    if (options.signal?.aborted) close();
    if (closed) throw new DOMException("Subscription closed", "AbortError");
    observedAt = Date.now();
    snapshot = await options.read();
    validate(snapshot);
    if (closed || snapshot.credentialExpiresAt <= Date.now())
      throw new DOMException("Subscription closed", "AbortError");
  } catch (error) {
    close();
    throw error;
  }
  return {
    start(): void {
      if (started || closed) return;
      started = true;
      emit("change");
      schedule();
      if (pending) wake();
    },
    close,
  };
}
