import { idempotencyKeySchema } from "@joint/contracts";
export function parseAccountRouteId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = idempotencyKeySchema.safeParse(value);
  return parsed.success ? parsed.data.toLowerCase() : null;
}
