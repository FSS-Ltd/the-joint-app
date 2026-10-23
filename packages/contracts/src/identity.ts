import { z } from "zod";
export const emailSchema = z
  .email()
  .max(254)
  .transform((value) => value.trim().toLowerCase());
export const signUpSchema = z
  .object({ email: emailSchema, password: z.string().min(12).max(128) })
  .strict();
export const signInSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(128) })
  .strict();
export const verifyEmailSchema = z
  .object({
    email: emailSchema,
    code: z.string().regex(/^\d{6}$/),
    type: z.enum(["signup", "recovery"]),
  })
  .strict();
export const householdCreateSchema = z
  .object({ name: z.string().trim().min(1).max(80) })
  .strict();
export const householdSummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    baseCurrency: z.literal("GBP"),
    timezone: z.literal("Europe/London"),
  })
  .strict();
export type HouseholdSummary = z.infer<typeof householdSummarySchema>;
export const inviteSchema = z.object({ email: emailSchema }).strict();
export const invitationCreatedSchema = z
  .object({
    id: z.uuid(),
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type InvitationCreated = z.infer<typeof invitationCreatedSchema>;
export const acceptInviteSchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
export const idempotencyKeySchema = z.uuid();
export const mfaCodeSchema = z
  .object({
    factorId: z.union([z.uuid(), z.literal("clerk_totp")]),
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();

export const verifiedIdentitySchema = z.object({
  sub: z.uuid(),
  session_id: z.uuid(),
  role: z.literal("authenticated"),
  aal: z.enum(["aal1", "aal2"]).default("aal1"),
  amr: z
    .array(z.object({ method: z.string(), timestamp: z.number() }))
    .optional(),
  exp: z.number(),
});
export type VerifiedIdentity = z.infer<typeof verifiedIdentitySchema>;
export const providerTokensSchema = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
  })
  .strict();
export type ProviderTokens = z.infer<typeof providerTokensSchema>;

export const authResultSchema = z
  .object({
    state: z.enum([
      "VERIFY_EMAIL",
      "AUTHENTICATED",
      "MFA_REQUIRED",
      "PASSWORD_RESET_REQUIRED",
      "SIGNED_OUT",
    ]),
    providerCleanupPending: z.boolean().optional(),
    providerCleanupToken: z
      .string()
      .max(4096)
      .regex(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
      .optional(),
    browserToken: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
  })
  .strict();
export const mfaEnrollmentSchema = z
  .object({
    factorId: z.uuid(),
    qrCode: z.string().max(1000000),
    secret: z.string().max(200),
  })
  .strict();
export const passwordResetSchema = z
  .object({ password: z.string().min(12).max(128) })
  .strict();
export const recoverySchema = z.object({ email: emailSchema }).strict();
export const logoutSchema = z
  .object({ scope: z.enum(["local", "global"]) })
  .strict();
export const emptyObjectSchema = z.object({}).strict();
export const meResponseSchema = z
  .object({
    user: z.object({ id: z.uuid(), email: z.email() }).strict(),
    membership: z
      .object({
        id: z.uuid(),
        householdId: z.uuid(),
        role: z.enum(["ADMIN", "MEMBER"]),
        grantVersion: z.number().int().nonnegative(),
        household: householdSummarySchema.extend({
          memberCount: z.number().int().min(1).max(2),
        }),
      })
      .strict()
      .nullable(),
    session: z
      .object({
        aal: z.enum(["aal1", "aal2"]),
        expiresAt: z.iso.datetime(),
        needsMfa: z.boolean(),
        mfaVerifiedAt: z.iso.datetime().nullable().default(null),
        purpose: z.enum(["NORMAL", "RECOVERY"]),
      })
      .strict(),
    factors: z.array(
      z
        .object({
          id: z.union([z.uuid(), z.literal("clerk_totp")]),
          friendlyName: z.string(),
          status: z.enum(["verified", "unverified"]),
        })
        .strict(),
    ),
  })
  .strict();
export type MeResponse = z.infer<typeof meResponseSchema>;
