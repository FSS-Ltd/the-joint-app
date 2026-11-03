import { sessionActor } from "./provider-session";
export type SessionSelection = {
  id: string;
  user?: { id: string } | null;
  status?: string;
  currentTask?: { key: string } | null;
};
export type MutationSnapshot = {
  busy: boolean;
  quarantined: boolean;
  slow: boolean;
  phase: "attempt" | "session";
  notice: string;
};
export type MutationScope = {
  current(): boolean;
  hold<T>(promise: Promise<T>): Promise<T>;
  activate(id: string | null, action: () => Promise<void>): Promise<void>;
};
/** Serializes this app's SDK writes. SDK selection is not cancellable; conflicts stay concealed. */
export class IdentityMutations {
  private snapshot: MutationSnapshot = {
    busy: false,
    quarantined: false,
    slow: false,
    phase: "attempt",
    notice: "",
  };
  private listeners = new Set<() => void>();
  private baseline: string | null = null;
  private observed: string | null = null;
  private expectedId: string | null | undefined;
  private desired: string | null = null;
  private generation = 0;
  constructor(
    private readonly port: {
      current(): SessionSelection | null | undefined;
      find(id: string): SessionSelection | undefined;
      select(id: string | null): Promise<void>;
      block(): void;
      settle(): Promise<void>;
    },
  ) {}
  getSnapshot = (): MutationSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(update: Partial<MutationSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update };
    this.listeners.forEach((listener) => listener());
  }
  private quarantine(): void {
    this.port.block();
    this.publish({ quarantined: true });
  }
  observe(session: SessionSelection | null | undefined): void {
    if (
      session === undefined ||
      (!this.snapshot.busy && !this.snapshot.quarantined)
    )
      return;
    const actor = sessionActor(session);
    // SDK loading and our own late completion are not a newer user intent.
    if (
      actor === this.observed ||
      actor === this.baseline ||
      (this.expectedId !== undefined &&
        (session?.id ?? null) === this.expectedId)
    )
      return;
    this.observed = actor;
    this.desired = session?.id ?? null;
    this.generation++;
    this.quarantine();
  }
  async run(
    action: (scope: MutationScope) => Promise<void>,
    phase: "attempt" | "session" = "attempt",
  ): Promise<void> {
    if (this.snapshot.busy || this.snapshot.quarantined)
      throw new Error("A sign-in transition is still pending.");
    await this.execute(action, phase);
  }
  private async execute(
    action: (scope: MutationScope) => Promise<void>,
    phase: "attempt" | "session",
    reselect = false,
  ): Promise<void> {
    this.baseline = sessionActor(this.port.current());
    this.observed = this.baseline;
    this.expectedId = undefined;
    const generation = this.generation;
    this.port.block();
    this.publish({
      busy: true,
      slow: false,
      phase,
      ...(reselect ? { quarantined: false } : {}),
    });
    const timer = setTimeout(() => this.publish({ slow: true }), 15000);
    const held = new Set<Promise<void>>();
    const scope: MutationScope = {
      hold: (promise) => {
        const settled = promise.then(
          () => {},
          () => {},
        );
        held.add(settled);
        void settled.then(() => held.delete(settled));
        return promise;
      },
      current: () =>
        this.generation === generation && !this.snapshot.quarantined,
      activate: async (id, activate) => {
        if (!scope.current()) throw new Error("Sign-in changed.");
        if (id !== null && !this.port.find(id)) {
          this.desired = id;
          this.quarantine();
          throw new Error("Sign-in is no longer available.");
        }
        this.expectedId = id;
        this.publish({ phase: "session" });
        try {
          await activate();
        } catch (error) {
          if (scope.current()) {
            this.desired = id;
            this.quarantine();
          }
          throw error;
        }
        if (
          scope.current() &&
          ((this.port.current()?.id ?? null) !== id ||
            (id !== null && !this.port.find(id)))
        ) {
          this.desired = id;
          this.quarantine();
        }
      },
    };
    try {
      await action(scope);
    } finally {
      await Promise.all(held);
      clearTimeout(timer);
      // A timeout only changes feedback. It never releases an unfinished SDK call.
      if (this.port.current() === undefined) this.quarantine();
      this.publish({ busy: false, slow: false });
      if (!this.snapshot.quarantined) await this.port.settle();
    }
  }
  async reselect(startOver = false): Promise<void> {
    if (this.snapshot.busy || !this.snapshot.quarantined) return;
    const target = startOver ? null : this.desired;
    if (target !== null && !this.port.find(target))
      throw new Error("That sign-in is no longer available. Start again.");
    await this.execute(
      (scope) => scope.activate(target, () => this.port.select(target)),
      "session",
      true,
    );
    if (target === null && !this.snapshot.quarantined)
      this.publish({
        notice:
          "The active sign-in was cleared on this device. Server and other-device sign-out could not be confirmed.",
      });
  }
}
