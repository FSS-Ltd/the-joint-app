import { NativeApiError } from "./errors";

export const requestDeadlineMs = 15000;
/** Enough for a maximum-size CSV on a slow link; JSON requests keep the short deadline. */
export const csvUploadDeadlineMs = 120000;

/** One explicit operation owns its deadline, cancellation and asynchronous fences. */
export class RequestLifetime {
  readonly controller = new AbortController();
  private readonly timeout: ReturnType<typeof setTimeout>;
  private readonly cancel = () => this.close();

  constructor(
    private readonly caller: AbortSignal,
    deadlineMs = requestDeadlineMs,
  ) {
    this.timeout = setTimeout(this.cancel, deadlineMs);
    caller.addEventListener("abort", this.cancel, { once: true });
    if (caller.aborted) this.close();
  }

  check(): void {
    if (this.controller.signal.aborted) throw new NativeApiError(0);
  }

  finishHandshake(): void {
    clearTimeout(this.timeout);
    this.check();
  }

  close(): void {
    clearTimeout(this.timeout);
    this.caller.removeEventListener("abort", this.cancel);
    this.controller.abort();
  }

  async wait<T>(
    operation: Promise<T>,
    discard?: (value: T) => void,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const signal = this.controller.signal;
      const cancel = () => {
        signal.removeEventListener("abort", cancel);
        reject(new NativeApiError(0));
      };
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
      operation.then(
        (value) => {
          signal.removeEventListener("abort", cancel);
          if (signal.aborted) {
            discard?.(value);
            reject(new NativeApiError(0));
          } else resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", cancel);
          reject(signal.aborted ? new NativeApiError(0) : error);
        },
      );
    });
  }
}
