import { ServiceUnavailableException } from "@nestjs/common";
import type { StatusEventSource } from "./status-observer.js";

export interface StatusHubCallbacks {
  onReady(): void;
  onWake(): void;
  onUnavailable(): void;
}

/** One process listener; only registered, authenticated resource observers may read. */
export class StatusEventHub implements StatusEventSource {
  private readonly listeners = new Set<{
    wake: () => void;
    disconnect: () => void;
  }>();
  private available = false;
  private stopped = false;
  private closing: Promise<void> | undefined;
  private readonly connection: { close(): Promise<void> };

  constructor(
    start: (callbacks: StatusHubCallbacks) => { close(): Promise<void> },
  ) {
    this.connection = start({
      onReady: () => {
        if (this.stopped) return;
        this.available = true;
        for (const listener of [...this.listeners]) listener.wake();
      },
      onWake: () => {
        if (!this.available || this.stopped) return;
        for (const listener of [...this.listeners]) listener.wake();
      },
      onUnavailable: () => {
        this.available = false;
        this.disconnect();
      },
    });
  }

  subscribe(wake: () => void, disconnect: () => void): () => void {
    if (!this.available || this.stopped || this.listeners.size >= 256)
      throw new ServiceUnavailableException();
    const listener = { wake, disconnect };
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private disconnect(): void {
    const listeners = [...this.listeners];
    this.listeners.clear();
    for (const listener of listeners) listener.disconnect();
  }
  close(): Promise<void> {
    this.closing ??= (async () => {
      this.stopped = true;
      this.available = false;
      this.disconnect();
      await this.connection.close();
    })();
    return this.closing;
  }
  onModuleDestroy(): Promise<void> {
    return this.close();
  }
}
