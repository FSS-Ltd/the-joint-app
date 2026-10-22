import { z } from "zod";
export const healthSchema = z
  .object({ status: z.enum(["ok", "unavailable"]) })
  .strict();
export type HealthResponse = z.infer<typeof healthSchema>;
export const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z
    .url()
    .refine(
      (value) =>
        URL.canParse(value) &&
        ["postgres:", "postgresql:"].includes(new URL(value).protocol),
    ),
  DATABASE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(10000)
    .default(2000),
});
export const apiEnvironmentSchema = databaseEnvironmentSchema.extend({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
});
export const workerEnvironmentSchema = databaseEnvironmentSchema.extend({
  WORKER_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60000)
    .default(10000),
});
export function readEnvironment<T>(
  schema: z.ZodType<T>,
  values: Record<string, string | undefined>,
): T {
  const result = schema.safeParse(values);
  if (!result.success)
    throw new Error(
      `Invalid environment fields: ${[...new Set(result.error.issues.map((issue) => issue.path.join(".")))].join(", ")}`,
    );
  return result.data;
}
