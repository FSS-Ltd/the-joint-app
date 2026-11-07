import type { StatusSubscription } from "@joint/contracts";

/** The shared subset implemented by Expo fetch and standards-based test fetches. */
export interface NativeReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void>;
  releaseLock(): void;
}
export interface NativeBody {
  getReader(): NativeReader;
  cancel(): Promise<void>;
}
export interface NativeResponse {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  readonly body: NativeBody | null;
}
export type NativeMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
export interface NativeSendOptions {
  method: NativeMethod;
  headers: Record<string, string>;
  signal: AbortSignal;
  credentials: "omit";
  redirect: "error";
  cache: "no-store";
  body?: string | Uint8Array<ArrayBuffer>;
}
export type NativeSend = (
  url: string,
  options: NativeSendOptions,
) => Promise<NativeResponse>;
export interface NativeCsvUpload {
  bytes: Uint8Array<ArrayBuffer>;
  accountId: string;
  /** Already URI-encoded JSON mapping header, if the endpoint takes one. */
  mapping?: string;
}
export interface NativeRequestOptions {
  method: NativeMethod;
  signal: AbortSignal;
  body?: object;
  /** Raw CSV upload; mutually exclusive with `body` and POST only. */
  csv?: NativeCsvUpload;
  idempotencyKey?: string;
  version?: number;
  authorization?:
    { kind: "bearer" } | { kind: "logout-cleanup"; ticket: string };
}
export interface NativeStatusConnection {
  readonly response: NativeResponse;
  close(): void;
}
export interface NativeTransport {
  request<T>(
    path: string,
    schema: { parse(value: unknown): T },
    options: NativeRequestOptions,
  ): Promise<T>;
  openStatus(
    selector: StatusSubscription,
    signal: AbortSignal,
  ): Promise<NativeStatusConnection>;
}
