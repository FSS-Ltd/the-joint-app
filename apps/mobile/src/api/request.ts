import { isClerkAPIResponseError } from "@clerk/expo";
import { nativeSend } from "./send";
import {
  idempotencyKeySchema,
  quotedVersionSchema,
  statusSubscriptionQuery,
} from "@joint/contracts";
import { discardBody, maximumJsonBytes, readJson } from "./body";
import { csvRequest } from "./csv-request";
import { errorCode, NativeApiError } from "./errors";
import { statusConnection } from "./status-connection";
import { csvUploadDeadlineMs, RequestLifetime } from "./lifetime";
import type {
  NativeRequestOptions,
  NativeResponse,
  NativeSend,
  NativeTransport,
} from "./types";
export type {
  NativeTransport,
  NativeStatusConnection,
  NativeRequestOptions,
  NativeSend,
} from "./types";

export function createNativeTransport(
  baseUrl: string,
  getToken: () => Promise<string | null>,
  send: NativeSend = nativeSend,
): NativeTransport {
  const base = new URL(baseUrl);
  if (
    !/^https?:$/.test(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new NativeApiError(0);
  const root = baseUrl.replace(/\/$/, "");

  async function headersFor(
    options: NativeRequestOptions,
    lifetime: RequestLifetime,
  ): Promise<Record<string, string>> {
    lifetime.check();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.authorization?.kind === "logout-cleanup") {
      const ticket = options.authorization.ticket;
      if (
        !/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(ticket) ||
        ticket.length > 4096
      )
        throw new NativeApiError(401);
      headers["X-Logout-Cleanup"] = ticket;
      return headers;
    }
    let token: string | null;
    try {
      token = await lifetime.wait(getToken());
    } catch (error) {
      if (
        isClerkAPIResponseError(error) &&
        (error.status === 401 ||
          error.status === 403 ||
          (error.status === 404 &&
            error.errors.some((item) => item.code === "session_not_found")))
      )
        throw new NativeApiError(401);
      throw error;
    }
    lifetime.check();
    if (!token) throw new NativeApiError(401);
    headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async function dispatch(
    path: string,
    options: NativeRequestOptions,
    lifetime: RequestLifetime,
    onSend: () => void,
    accept = "application/json",
  ): Promise<NativeResponse> {
    lifetime.check();
    if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*(?:\?[^#]*)?$/.test(path))
      throw new NativeApiError(0);
    if (
      options.authorization?.kind === "logout-cleanup" &&
      (path !== "auth/logout/retry" || options.method !== "POST")
    )
      throw new NativeApiError(401);
    if (
      options.csv &&
      (options.body !== undefined || options.method !== "POST")
    )
      throw new NativeApiError(0);
    const csv = options.csv ? csvRequest(options.csv) : undefined;
    const body =
      csv !== undefined
        ? csv.body
        : options.body === undefined
          ? undefined
          : JSON.stringify(options.body);
    if (options.method === "GET" && body !== undefined)
      throw new NativeApiError(0);
    if (
      typeof body === "string" &&
      new TextEncoder().encode(body).byteLength > maximumJsonBytes
    )
      throw new NativeApiError(0);
    const key =
      options.idempotencyKey === undefined
        ? undefined
        : idempotencyKeySchema.parse(options.idempotencyKey);
    const version =
      options.version === undefined
        ? undefined
        : `"${quotedVersionSchema.parse(`"${options.version}"`)}"`;
    const headers = await headersFor(options, lifetime);
    lifetime.check();
    headers.Accept = accept;
    if (csv) Object.assign(headers, csv.headers);
    else if (body !== undefined) headers["Content-Type"] = "application/json";
    if (key !== undefined) headers["Idempotency-Key"] = key;
    if (version !== undefined) headers["If-Match"] = version;
    onSend();
    return lifetime.wait(
      send(`${root}/v1/${path}`, {
        method: options.method,
        signal: lifetime.controller.signal,
        headers,
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        ...(body === undefined ? {} : { body }),
      }),
      (response) => discardBody(response.body),
    );
  }

  return {
    async request<T>(
      path: string,
      schema: { parse(value: unknown): T },
      options: NativeRequestOptions,
    ): Promise<T> {
      options = { ...options };
      const lifetime = new RequestLifetime(
        options.signal,
        options.csv ? csvUploadDeadlineMs : undefined,
      );
      let sent = false;
      let status = 0;
      try {
        const response = await dispatch(path, options, lifetime, () => {
          sent = true;
        });
        status = response.status;
        const value = await readJson(response, lifetime);
        lifetime.check();
        if (status < 200 || status >= 300)
          throw new NativeApiError(status, errorCode(value));
        const parsed = schema.parse(value);
        lifetime.check();
        return parsed;
      } catch (error) {
        const failedStatus =
          status >= 400
            ? status
            : error instanceof NativeApiError
              ? error.status
              : 0;
        const outcome =
          sent &&
          options.method !== "GET" &&
          (failedStatus === 0 || failedStatus >= 500)
            ? "uncertain"
            : "rejected";
        throw new NativeApiError(
          failedStatus,
          error instanceof NativeApiError ? error.code : undefined,
          outcome,
        );
      } finally {
        lifetime.close();
      }
    },
    async openStatus(selector, signal) {
      const lifetime = new RequestLifetime(signal);
      let response: NativeResponse | undefined;
      try {
        response = await dispatch(
          `events?${statusSubscriptionQuery(selector)}`,
          { method: "GET", signal },
          lifetime,
          () => {},
          "text/event-stream",
        );
        lifetime.finishHandshake();
        return statusConnection(response, lifetime);
      } catch (error) {
        lifetime.close();
        if (response) discardBody(response.body);
        if (error instanceof NativeApiError) throw error;
        throw new NativeApiError(0);
      }
    },
  };
}
