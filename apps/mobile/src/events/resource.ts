import { NativeApiError } from "../api/errors";
import type { NativeTransport } from "../api/types";
import {
  captureResourceScope,
  sameResourceScope,
  type NativeResourceScope,
} from "./scope";
import { readNativeStatusStream } from "./stream";

interface NativeResource<T> {
  scope: NativeResourceScope;
  transport: NativeTransport;
  read(scope: NativeResourceScope, signal: AbortSignal): Promise<T>;
  receive(value: T): void;
  unavailable(refreshing?: boolean): void;
  failure(error: unknown): void;
  revoke(actor: string): void;
}
function retryable(error: unknown): boolean {
  return (
    error instanceof NativeApiError &&
    error.code !== "INVALID_STATUS_STREAM" &&
    (error.status === 0 ||
      error.status >= 500 ||
      error.status === 408 ||
      error.status === 429)
  );
}

/** One foreground resource; scope replacement and loss invalidate every awaited result. */
export class NativeResourceController<T> {
  private scope: NativeResourceScope | null;
  private started = false;
  private active = true;
  private closed = false;
  private terminal = false;
  private epoch = 0;
  private revision = 0;
  private retries = 0;
  private liveSince: number | null = null;
  private stream: AbortController | undefined;
  private read: AbortController | undefined;
  private pending = false;
  private hasReadyRead = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly resource: NativeResource<T>) {
    this.scope = captureResourceScope(resource.scope);
  }
  start(): void {
    if (this.closed || this.started) return;
    this.started = true;
    this.resource.unavailable();
    this.connect();
  }
  background(): void {
    if (this.closed || !this.active) return;
    this.active = false;
    this.detach();
    this.resource.unavailable();
  }
  foreground(): void {
    if (this.closed || this.active) return;
    this.active = true;
    this.connect();
  }
  replaceAuthority(scope: NativeResourceScope | null): void {
    if (this.closed) return;
    const next = scope === null ? null : captureResourceScope(scope);
    if (sameResourceScope(this.scope, next)) return;
    this.detach();
    this.scope = next;
    this.terminal = false;
    this.retries = 0;
    this.resource.unavailable();
    this.connect();
  }
  retry(): void {
    if (this.closed) return;
    this.detach();
    this.terminal = false;
    this.retries = 0;
    this.resource.unavailable();
    this.connect();
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.detach();
    this.scope = null;
    this.resource.unavailable();
  }
  private current(epoch: number): boolean {
    return (
      !this.closed &&
      this.started &&
      this.active &&
      !this.terminal &&
      this.epoch === epoch
    );
  }
  private detach(): void {
    this.epoch++;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.stream?.abort();
    this.read?.abort();
    this.stream = undefined;
    this.read = undefined;
    this.pending = false;
    this.hasReadyRead = false;
  }
  private lost(
    error: unknown,
    epoch: number,
    scope: NativeResourceScope,
    renew = false,
  ): void {
    if (!this.current(epoch)) return;
    const hadReadyRead = this.hasReadyRead;
    if (this.liveSince !== null && Date.now() - this.liveSince >= 30000)
      this.retries = 0;
    this.detach();
    const nextEpoch = this.epoch;
    this.terminal = !retryable(error) || this.retries >= 5;
    this.hasReadyRead = renew && hadReadyRead && !this.terminal;
    this.resource.unavailable(this.hasReadyRead || undefined);
    if (this.closed || this.epoch !== nextEpoch) return;
    if (error instanceof NativeApiError && error.status === 401)
      this.resource.revoke(scope.actor);
    if (this.closed || this.epoch !== nextEpoch) return;
    if (this.terminal) this.resource.failure(error);
    else
      this.timer = setTimeout(
        () => {
          this.timer = undefined;
          this.connect();
        },
        1000 * 2 ** this.retries++,
      );
  }
  private connect(): void {
    if (!this.current(this.epoch) || !this.scope || this.stream || this.timer)
      return;
    const epoch = this.epoch,
      scope = this.scope;
    const stream = new AbortController();
    this.stream = stream;
    this.liveSince = null;
    void readNativeStatusStream(
      scope.selector,
      this.resource.transport,
      stream.signal,
      (value) => {
        if (!this.current(epoch)) return;
        if (value === "change") {
          this.liveSince ??= Date.now();
          this.revision++;
          this.resource.unavailable(this.hasReadyRead || undefined);
          if (this.current(epoch)) this.queueRead(epoch, scope);
        } else
          this.lost(
            new NativeApiError(value === "invalidate" ? 404 : 0),
            epoch,
            scope,
            value === "renew",
          );
      },
    ).catch((error) => this.lost(error, epoch, scope));
  }
  private queueRead(epoch: number, scope: NativeResourceScope): void {
    if (!this.current(epoch)) return;
    this.pending = true;
    if (this.read) return;
    this.pending = false;
    const controller = new AbortController(),
      revision = this.revision;
    this.read = controller;
    void this.refresh(scope, controller, epoch, revision);
  }
  private async refresh(
    scope: NativeResourceScope,
    controller: AbortController,
    epoch: number,
    revision: number,
  ): Promise<void> {
    try {
      const value = await this.resource.read(scope, controller.signal);
      if (
        this.current(epoch) &&
        !controller.signal.aborted &&
        revision === this.revision
      ) {
        this.hasReadyRead = true;
        this.resource.receive(value);
      }
    } catch (error) {
      if (!controller.signal.aborted) this.lost(error, epoch, scope);
    } finally {
      if (this.current(epoch) && this.read === controller) {
        this.read = undefined;
        if (this.pending) this.queueRead(epoch, scope);
      }
    }
  }
}
