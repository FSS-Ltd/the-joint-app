import { idempotencyKeySchema, quotedVersionSchema } from "@joint/contracts";
import { BffError, type Schema } from "./responses";

export function financeId(value: string): string {
  const result = idempotencyKeySchema.safeParse(value);
  if (!result.success)
    throw new BffError(400, "INVALID_INPUT", "This record could not be found.");
  return result.data;
}
export function financeKey(request: Request): string {
  return financeId(request.headers.get("Idempotency-Key") ?? "");
}
export function financeVersion(request: Request): string {
  const value = request.headers.get("If-Match");
  if (value === null || !quotedVersionSchema.safeParse(value).success)
    throw new BffError(
      400,
      "INVALID_INPUT",
      "Refresh this record and try again.",
    );
  return value;
}
export function financeQuery<T extends object>(
  request: Request,
  schema: Schema<T>,
): URLSearchParams {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((name) => params.getAll(name).length !== 1))
    throw new BffError(
      400,
      "INVALID_INPUT",
      "Check the list options and try again.",
    );
  const result = schema.safeParse(Object.fromEntries(params));
  if (!result.success)
    throw new BffError(
      400,
      "INVALID_INPUT",
      "Check the list options and try again.",
    );
  return new URLSearchParams(
    Object.entries(result.data).map(([key, value]) => [key, String(value)]),
  );
}
