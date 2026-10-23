export class BffError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

export function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", Vary: "Cookie" },
  });
}

export async function route(
  action: () => Promise<Response>,
): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    return errorResponse(error);
  }
}

export function parseResponse<T>(schema: Schema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BffError(
      503,
      "INVALID_RESPONSE",
      "This service is unavailable. Please try again shortly.",
    );
  return result.data;
}

export function errorResponse(error: unknown): Response {
  const failure =
    error instanceof BffError
      ? error
      : new BffError(
          503,
          "UNAVAILABLE",
          "This service is unavailable. Please try again shortly.",
        );
  return json(
    { error: { code: failure.code, message: failure.message } },
    failure.status,
  );
}
