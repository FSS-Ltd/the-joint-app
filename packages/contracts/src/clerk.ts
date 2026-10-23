import { z } from "zod";

const originSchema = z
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/" &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    );
  })
  .transform((value) => new URL(value).origin);

export const clerkServerEnvironmentSchema = z.object({
  CLERK_ISSUER: originSchema,
  CLERK_JWT_KEY: z
    .string()
    .min(100)
    .max(8192)
    .regex(
      /^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+\n-----END PUBLIC KEY-----\n?$/,
    ),
  CLERK_SECRET_KEY: z.string().regex(/^sk_test_[A-Za-z0-9_-]{16,4096}$/),
  CLERK_AUTHORIZED_PARTIES: z
    .string()
    .transform((value) => value.split(",").map((origin) => origin.trim()))
    .pipe(z.array(originSchema).min(1).max(10)),
  CLERK_TIMEOUT_MS: z.coerce.number().int().min(100).max(5000).default(2000),
});
export type ClerkServerEnvironment = z.infer<
  typeof clerkServerEnvironmentSchema
>;

export const clerkWebEnvironmentSchema = z
  .object({
    CLERK_ISSUER: originSchema,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
      .string()
      .regex(/^pk_test_[A-Za-z0-9+/=_-]{8,4096}$/),
  })
  .superRefine((value, context) => {
    try {
      const host = atob(value.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.slice(8));
      if (host !== `${new URL(value.CLERK_ISSUER).host}$`)
        throw new Error("Key issuer mismatch");
    } catch {
      context.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
        message: "Publishable key must match the configured instance",
      });
    }
  });
export const clerkWebhookEnvironmentSchema = z.object({
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().regex(/^whsec_[A-Za-z0-9+/]{43}=$/),
});
export const clerkWebhookEndpointEnvironmentSchema =
  clerkWebhookEnvironmentSchema.extend({
    CLERK_WEBHOOK_INSTANCE_ID: z.string().regex(/^ins_[A-Za-z0-9]{1,124}$/),
  });

// Provider payloads are projected at the server boundary; unknown profile fields are discarded.
export const clerkProviderSessionSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  status: z.string(),
  expire_at: z.number().int().positive(),
  created_at: z.number().int().positive(),
  actor: z.record(z.string(), z.unknown()).nullable(),
  tasks: z.array(z.unknown()).optional(),
});
export const clerkProviderUserSchema = z.object({
  id: z.string(),
  primary_email_address_id: z.string().nullable(),
  email_addresses: z.array(
    z.object({
      id: z.string(),
      email_address: z.email(),
      verification: z.object({ status: z.string() }).nullable(),
    }),
  ),
  banned: z.boolean(),
  locked: z.boolean(),
  totp_enabled: z.boolean(),
  two_factor_enabled: z.boolean(),
  backup_code_enabled: z.boolean(),
  phone_numbers: z.array(z.object({ reserved_for_second_factor: z.boolean() })),
});

export const clerkSessionClaimsSchema = z.object({
  v: z.literal(2),
  sub: z.string().regex(/^user_[A-Za-z0-9]+$/),
  sid: z.string().regex(/^sess_[A-Za-z0-9]+$/),
  iss: z.string(),
  azp: z.string(),
  exp: z.number().int().positive(),
  iat: z.number().int().positive(),
  fva: z.tuple([z.number().int().min(-1), z.number().int().min(-1)]).optional(),
  sts: z.literal("active").optional(),
  act: z.never().optional(),
});

export const authProviderSchema = z.enum(["local", "clerk"]);
export function readAuthProvider(
  values: Record<string, string | undefined>,
): "local" | "clerk" {
  if (values.AUTH_PROVIDER === undefined) {
    if (
      [
        "CLERK_ISSUER",
        "CLERK_SECRET_KEY",
        "CLERK_JWT_KEY",
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      ].some((key) => values[key] !== undefined)
    )
      throw new Error("Invalid environment fields: AUTH_PROVIDER");
    return "local";
  }
  const result = authProviderSchema.safeParse(values.AUTH_PROVIDER);
  if (!result.success)
    throw new Error("Invalid environment fields: AUTH_PROVIDER");
  return result.data;
}
export const clerkProviderSessionListSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string().regex(/^sess_[A-Za-z0-9]+$/),
        user_id: z.string().regex(/^user_[A-Za-z0-9]+$/),
        created_at: z.number().int().positive(),
      }),
    )
    .max(20),
  total_count: z.number().int().nonnegative(),
});

export type ClerkSessionClaims = z.infer<typeof clerkSessionClaimsSchema>;
export const clerkTotpVerificationSchema = z.object({
  verified: z.literal(true),
  code_type: z.literal("totp"),
});
export const clerkWebhookEnvelopeSchema = z.object({
  object: z.literal("event"),
  instance_id: z.string(),
  type: z.string().min(1).max(100),
  timestamp: z.number().int().positive(),
  data: z.object({
    id: z.string().min(1).max(128),
    user_id: z.string().optional(),
  }),
});
export const clerkIdentityEnvironmentSchema =
  clerkServerEnvironmentSchema.extend({
    AUTH_TOKEN_KEY: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
    AUTH_EMAIL_HASH_KEY: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
  });

export const clerkLogoutContextSchema = z
  .object({
    issuer: z.url().max(255),
    subject: z.string().regex(/^user_[A-Za-z0-9]{1,123}$/),
    sessionId: z.string().regex(/^sess_[A-Za-z0-9]{1,123}$/),
    scope: z.enum(["local", "global"]),
    cutoffAt: z.number().int().positive(),
  })
  .strict();
export type ClerkLogoutContext = z.infer<typeof clerkLogoutContextSchema>;

export const clerkRevokedSessionSchema = z.object({
  id: z.string().regex(/^sess_[A-Za-z0-9]+$/),
  user_id: z.string().regex(/^user_[A-Za-z0-9]+$/),
  status: z.enum(["revoked", "ended", "abandoned", "expired", "removed"]),
});
