import { request, RequestError } from "../identity/client";

interface Schema<T> {
  parse(value: unknown): T;
}
async function result<T>(response: Response, schema: Schema<T>): Promise<T> {
  const value: unknown = await response.json();
  if (!response.ok) {
    if (
      typeof value === "object" &&
      value !== null &&
      "error" in value &&
      typeof value.error === "object" &&
      value.error !== null &&
      "message" in value.error &&
      typeof value.error.message === "string"
    ) {
      throw new RequestError(
        value.error.message,
        response.status,
        "code" in value.error && typeof value.error.code === "string"
          ? value.error.code
          : undefined,
      );
    }
    throw new RequestError(
      "This request could not be completed. Please try again.",
      response.status,
    );
  }
  return schema.parse(value);
}
export async function uploadCsv<T>(
  path: string,
  file: File,
  accountId: string,
  schema: Schema<T>,
  mapping?: object,
  key?: string,
): Promise<T> {
  try {
    const { csrfToken } = await request<{ csrfToken: string }>(
      "/api/auth/csrf",
    );
    const headers: Record<string, string> = {
      "Content-Type": "text/csv;charset=UTF-8",
      "X-CSRF-Token": csrfToken,
      "X-Account-Id": accountId,
    };
    if (mapping)
      headers["X-Import-Mapping"] = encodeURIComponent(JSON.stringify(mapping));
    if (key) headers["Idempotency-Key"] = key;
    const bytes = await file.arrayBuffer();
    return await result(
      await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers,
        body: bytes,
      }),
      schema,
    );
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(
      "The file could not be sent. Check your connection and try again.",
      0,
    );
  }
}
export async function removeRecord<T>(
  path: string,
  schema: Schema<T>,
  version?: number,
): Promise<T> {
  try {
    const { csrfToken } = await request<{ csrfToken: string }>(
      "/api/auth/csrf",
    );
    return await result(
      await fetch(path, {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "X-CSRF-Token": csrfToken,
          ...(version === undefined ? {} : { "If-Match": `"${version}"` }),
        },
      }),
      schema,
    );
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("We could not connect. Please try again.", 0);
  }
}
export function financePath(
  householdId: string,
  resource: "imports" | "transactions",
  id?: string,
): string {
  return `/api/households/${householdId}/${resource}${id ? `/${id}` : ""}`;
}
