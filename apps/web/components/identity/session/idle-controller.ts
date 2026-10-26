import { isRetryableStatusError } from "../../events/status-subscription";
import type { SessionDeadline } from "@joint/contracts";

type Operations = {
  read(signal: AbortSignal): Promise<SessionDeadline>;
  activity(age: number, signal: AbortSignal): Promise<SessionDeadline>;
  lock(): void;
  expire(): void;
  ready(): void;
  changed(): void;
  unavailable(): void;
};

/** Timers schedule expiry and dirty input only; they never poll idle sessions. */
export class IdleSessionController {
  private readonly abort = new AbortController();
  private deadline = 0;
  private lastInput: number | undefined;
  private sentAt = -Infinity;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private inputTimer: ReturnType<typeof setTimeout> | undefined;
  private pending: Promise<void> | undefined;
  private expired = false;
  private reconciliationPending = false;

  constructor(private readonly operations: Operations) {}

  start(): Promise<void> {
    return this.reconcile();
  }
  stop(): void {
    this.abort.abort();
    clearTimeout(this.expiryTimer);
    clearTimeout(this.inputTimer);
  }
  reconcile(hide = true): Promise<void> {
    if (this.expired || this.abort.signal.aborted) return Promise.resolve();
    if (hide || Date.now() >= this.deadline) this.operations.lock();
    if (this.pending) {
      this.reconciliationPending = true;
      return this.pending;
    }
    return this.perform(() => this.operations.read(this.abort.signal));
  }
  interact(): void {
    if (this.abort.signal.aborted || this.expired) return;
    if (Date.now() >= this.deadline) {
      void this.reconcile();
      return;
    }
    this.lastInput = Date.now();
    this.scheduleInput();
  }
  private scheduleInput(): void {
    if (
      this.abort.signal.aborted ||
      this.expired ||
      this.inputTimer !== undefined ||
      this.lastInput === undefined
    )
      return;
    const wait = Math.max(0, this.sentAt + 5000 - Date.now());
    this.inputTimer = setTimeout(() => {
      this.inputTimer = undefined;
      if (this.pending) {
        void this.pending.then(() => this.scheduleInput());
        return;
      }
      const input = this.lastInput;
      this.lastInput = undefined;
      if (input === undefined || this.expired || this.abort.signal.aborted)
        return;
      if (Date.now() >= this.deadline) {
        void this.reconcile();
        return;
      }
      const age = Date.now() - input;
      // A throttled/sleeping tab must not report stale input as recent activity.
      if (age < 0 || age > 5000) return;
      this.sentAt = Date.now();
      void this.perform(
        () => this.operations.activity(age, this.abort.signal),
        true,
      );
    }, wait);
  }
  private perform(
    operation: () => Promise<SessionDeadline>,
    activity = false,
  ): Promise<void> {
    if (this.abort.signal.aborted || this.expired) return Promise.resolve();
    if (this.pending) return this.pending;
    const started = Date.now();
    this.pending = (async () => {
      try {
        const result = await Promise.resolve().then(operation);
        if (this.abort.signal.aborted || this.expired) return;
        if (this.reconciliationPending) {
          if (activity) this.operations.changed();
          if (Date.now() >= this.deadline) this.operations.lock();
          return;
        }
        const remaining =
          Date.parse(result.expiresAt) - Date.parse(result.serverTime);
        // Deduct the whole request duration, conservatively accounting for transit.
        const duration =
          Math.min(600_000, remaining) - Math.max(0, Date.now() - started);
        if (!Number.isFinite(duration) || duration <= 0) {
          this.end();
          return;
        }
        this.deadline = Date.now() + duration;
        clearTimeout(this.expiryTimer);
        this.expiryTimer = setTimeout(() => void this.reconcile(), duration);
        this.operations.ready();
        if (activity) this.operations.changed();
      } catch (error) {
        if (this.abort.signal.aborted) return;
        if (this.reconciliationPending) {
          this.operations.lock();
          return;
        }
        if (isRetryableStatusError(error) && Date.now() < this.deadline) {
          // A failed keep-alive cannot extend or revoke the last verified window.
          this.operations.ready();
          return;
        }
        this.deadline = 0;
        clearTimeout(this.expiryTimer);
        this.operations.lock();
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 401
        )
          this.end();
        else this.operations.unavailable();
      } finally {
        this.pending = undefined;
        if (this.reconciliationPending) {
          this.reconciliationPending = false;
          await this.reconcile(false);
        }
      }
    })();
    return this.pending;
  }
  private end(): void {
    this.expired = true;
    clearTimeout(this.expiryTimer);
    clearTimeout(this.inputTimer);
    this.operations.lock();
    this.operations.expire();
  }
}
