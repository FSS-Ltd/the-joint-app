/** Device-only capabilities. Additions survive persistence failures in memory;
 * removals take effect only after durable persistence succeeds. */
export class CleanupStore {
  private loadEpoch = 0;
  private tickets: readonly string[] = [];
  private listeners = new Set<() => void>();
  constructor(
    private readonly storage: {
      read(): Promise<string | null>;
      write(value: string): Promise<void>;
      remove(): Promise<void>;
    },
  ) {}
  getSnapshot = (): readonly string[] => this.tickets;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(tickets: readonly string[]): void {
    this.tickets = tickets;
    this.listeners.forEach((listener) => listener());
  }
  async load(): Promise<void> {
    const epoch = ++this.loadEpoch;
    const value = await this.storage.read();
    if (epoch !== this.loadEpoch || !value) return;
    // v1 originally stored one opaque token. Keep it usable during upgrade.
    let tickets: string[] = [value];
    if (value.startsWith("[")) {
      try {
        const parsed: unknown = JSON.parse(value);
        if (
          Array.isArray(parsed) &&
          parsed.every((item): item is string => typeof item === "string")
        )
          tickets = parsed;
      } catch {
        /* The server will terminally reject and retire malformed capabilities. */
      }
    }
    this.publish([...new Set(tickets)]);
  }
  private async persist(tickets: readonly string[]): Promise<void> {
    if (tickets.length) await this.storage.write(JSON.stringify(tickets));
    else await this.storage.remove();
  }
  async add(ticket: string): Promise<void> {
    const next = [...new Set([...this.tickets, ticket])];
    this.publish(next);
    await this.persist(next);
  }
  async replace(ticket: string, replacement: string | null): Promise<void> {
    const next = [
      ...new Set(
        this.tickets.flatMap((item) =>
          item === ticket ? (replacement ? [replacement] : []) : [item],
        ),
      ),
    ];
    await this.persist(next);
    this.publish(next);
  }
}
