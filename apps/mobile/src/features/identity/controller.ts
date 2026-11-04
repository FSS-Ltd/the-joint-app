import type { MeResponse, SessionDeadline } from "@joint/contracts";
import { IdleSessionController } from "@joint/identity-runtime";

export type IdentityState =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | {
      kind: "locked";
      reason: "background" | "expired" | "unavailable" | "transition";
    }
  | {
      kind: "security-required" | "household-required" | "ready";
      me: MeResponse;
    };

export type VerifiedNativeIdentity = {
  readonly actor: string;
  readonly me: MeResponse;
};

type IdentityReads = {
  readMe(signal: AbortSignal): Promise<MeResponse>;
  readDeadline(signal: AbortSignal): Promise<SessionDeadline>;
  recordActivity(age: number, signal: AbortSignal): Promise<SessionDeadline>;
};

/** Identity-derived state is memory-only and fenced by actor, session and lifecycle. */
export class NativeIdentityController {
  private state: IdentityState = { kind: "loading" };
  private verified: VerifiedNativeIdentity | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly revoked = new Set<string>();
  private actor: string | null | undefined;
  private active = true;
  private mutationsBlocked = false;
  private disposed = false;
  private epoch = 0;
  private abort: AbortController | undefined;
  private idle: IdleSessionController | undefined;

  constructor(private readonly api: IdentityReads) {}
  mount(): void {
    this.disposed = false;
    this.active = true;
  }
  getSnapshot = (): IdentityState => this.state;
  getVerifiedIdentity = (): VerifiedNativeIdentity | null => this.verified;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(state: IdentityState): void {
    if (this.disposed) return;
    this.state = state;
    this.verified =
      state.kind === "ready" && this.actor
        ? Object.freeze({ actor: this.actor, me: state.me })
        : null;
    this.listeners.forEach((listener) => listener());
  }
  private cancel(): void {
    this.epoch++;
    this.abort?.abort();
    this.idle?.stop();
    this.idle = undefined;
  }
  blockMutations(): void {
    this.mutationsBlocked = true;
    this.cancel();
    if (this.state.kind !== "signed-out")
      this.publish({
        kind: "locked",
        reason: this.active ? "transition" : "background",
      });
  }
  settleMutation(actor: string | null): Promise<void> {
    this.mutationsBlocked = false;
    this.actor = actor;
    return this.refresh();
  }
  async identify(actor: string | null): Promise<void> {
    if (this.actor === actor || this.disposed) return;
    this.actor = actor;
    await this.refresh();
  }
  background(): void {
    this.active = false;
    this.cancel();
    this.publish({ kind: "locked", reason: "background" });
  }
  foreground(reconcile = true): Promise<void> {
    this.active = true;
    if (this.mutationsBlocked) {
      this.publish({ kind: "locked", reason: "transition" });
      return Promise.resolve();
    }
    return reconcile ? this.refresh() : Promise.resolve();
  }
  interact(): void {
    if (this.active) this.idle?.interact();
  }
  conceal(): void {
    this.cancel();
    this.publish({
      kind: "locked",
      reason: this.active ? "unavailable" : "background",
    });
  }
  revoke(actor: string | null | undefined = this.actor): void {
    if (actor) this.revoked.add(actor);
    if (actor !== this.actor) return;
    this.cancel();
    this.publish({
      kind: "locked",
      reason: this.active ? "expired" : "background",
    });
  }
  async refresh(): Promise<void> {
    this.cancel();
    if (
      !this.active ||
      this.disposed ||
      this.mutationsBlocked ||
      this.actor === undefined
    )
      return;
    if (!this.actor) {
      this.publish({ kind: "signed-out" });
      return;
    }
    if (this.revoked.has(this.actor)) {
      this.publish({ kind: "locked", reason: "expired" });
      return;
    }
    this.publish({ kind: "loading" });
    const epoch = this.epoch;
    const abort = new AbortController();
    this.abort = abort;
    const current = () =>
      epoch === this.epoch &&
      !abort.signal.aborted &&
      this.active &&
      !this.disposed;
    try {
      const me = await this.api.readMe(abort.signal);
      if (!current()) return;
      const authorized: IdentityState = {
        kind:
          me.session.needsMfa || me.session.purpose === "RECOVERY"
            ? "security-required"
            : me.membership
              ? "ready"
              : "household-required",
        me,
      };
      this.idle = new IdleSessionController(
        {
          read: (signal) => this.api.readDeadline(signal),
          activity: (age, signal) => this.api.recordActivity(age, signal),
          ready: () => {
            if (current()) this.publish(authorized);
          },
          lock: () => {
            if (current()) this.publish({ kind: "loading" });
          },
          expire: () => {
            if (current()) this.revoke();
          },
          unavailable: () => {
            if (current())
              this.publish({ kind: "locked", reason: "unavailable" });
          },
          changed: () => {},
        },
        () => false,
      );
      // Native never reveals protected content after a failed authority check.
      await this.idle.start();
    } catch (error) {
      if (!current()) return;
      if (
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        error.status === 401
      )
        this.revoke();
      else this.publish({ kind: "locked", reason: "unavailable" });
    }
  }
  dispose(): void {
    this.cancel();
    this.actor = undefined;
    this.publish({ kind: "loading" });
    this.disposed = true;
    this.listeners.clear();
  }
}
