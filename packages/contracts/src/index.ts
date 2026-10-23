import { z } from "zod";
export const healthSchema = z
  .object({ status: z.enum(["ok", "unavailable"]) })
  .strict();
export type HealthResponse = z.infer<typeof healthSchema>;
const postgresUrlSchema = z
  .url()
  .refine(
    (value) =>
      URL.canParse(value) &&
      ["postgres:", "postgresql:"].includes(new URL(value).protocol),
  );
export const databaseEnvironmentSchema = z.object({
  DATABASE_URL: postgresUrlSchema,
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

export const bootstrapSchema = z
  .object({ status: z.literal("ok"), householdId: z.uuid() })
  .strict();
export type BootstrapResponse = z.infer<typeof bootstrapSchema>;
export const identityClaimsSchema = z.object({
  sub: z.uuid(),
  session_id: z.uuid(),
  role: z.literal("authenticated"),
});

const serverUrlSchema = z.url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  );
});
export const webEnvironmentSchema = z.object({
  API_BASE_URL: serverUrlSchema.default("http://127.0.0.1:3001"),
});
export const identityEnvironmentSchema = z.object({
  AUTH_ISSUER: serverUrlSchema.optional(),
});

export const migrationEnvironmentSchema = z.object({
  MIGRATION_DATABASE_URL: postgresUrlSchema.optional(),
});
export * from "./identity.js";

const identityKeySchema = z.string().regex(/^[A-Za-z0-9+/]{43}=$/);
export const authServerEnvironmentSchema = z.object({
  AUTH_ISSUER: serverUrlSchema,
  SUPABASE_AUTH_URL: serverUrlSchema,
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20).max(4096),
  AUTH_TOKEN_KEY: identityKeySchema,
  AUTH_EMAIL_HASH_KEY: identityKeySchema,
});
export type AuthServerEnvironment = z.infer<typeof authServerEnvironmentSchema>;
export * from "./accounts.js";
export * from "./imports.js";
export * from "./transactions.js";
export const importEnvironmentSchema = z.object({
  IMPORT_DATA_KEY: identityKeySchema,
});

export { isSupportedFinancialText } from "./financial-input.js";

export * from "./reporting-primitives.js";
export * from "./classifications.js";
export * from "./budgets.js";
export * from "./spending.js";
export * from "./transfers.js";
export * from "./exports.js";
export * from "./privacy.js";
export * from "./entitlements.js";
