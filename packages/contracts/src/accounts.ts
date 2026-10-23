import { z } from "zod";
import { bookedDateSchema } from "./financial-input.js";

export const accountKindSchema = z.enum([
  "CURRENT",
  "SAVINGS",
  "CREDIT_CARD",
  "LOAN",
  "MORTGAGE",
  "INVESTMENT",
  "PENSION",
  "PROPERTY",
  "OTHER_ASSET",
  "OTHER_LIABILITY",
]);
export const liquiditySchema = z.enum(["AVAILABLE", "RESTRICTED", "LOCKED"]);
export const grantLevelSchema = z.enum(["NONE", "TOTALS", "TRANSACTIONS"]);
export type GrantLevel = z.infer<typeof grantLevelSchema>;
export const amountMinorSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,18}|-[1-9]\d{0,18})$/)
  .pipe(
    z.string().refine((value) => {
      const amount = BigInt(value);
      return amount >= -9223372036854775808n && amount <= 9223372036854775807n;
    }, "Amount is outside the supported range"),
  );
export const moneySchema = z
  .object({ amountMinor: amountMinorSchema, currency: z.literal("GBP") })
  .strict();
export type Money = z.infer<typeof moneySchema>;
export const accountCreateSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    kind: accountKindSchema,
    currency: z.literal("GBP"),
    liquidity: liquiditySchema,
  })
  .strict();
export const accountPatchSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    liquidity: liquiditySchema,
  })
  .strict();
function validAdultPortion(value: {
  money: unknown;
  adultMoney?: unknown;
}): boolean {
  const original = moneySchema.safeParse(value.money);
  if (!original.success) return false;
  if (value.adultMoney === undefined || value.adultMoney === null) return true;
  const adult = moneySchema.safeParse(value.adultMoney);
  if (!adult.success) return false;
  const amount = BigInt(original.data.amountMinor);
  const portion = BigInt(adult.data.amountMinor);
  return amount < 0n ? portion === amount : portion >= 0n && portion <= amount;
}

export const valuationInputSchema = z
  .object({
    money: moneySchema,
    asOfDate: bookedDateSchema,
    adultMoney: moneySchema.nullable().optional(),
  })
  .strict()
  .refine(validAdultPortion, "Adult portion must match the recorded balance");
export type ValuationInput = z.infer<typeof valuationInputSchema>;
export const grantInputSchema = z.object({ level: grantLevelSchema }).strict();
export const valuationSchema = z
  .object({
    id: z.uuid(),
    money: moneySchema,
    asOfDate: bookedDateSchema,
    recordedAt: z.iso.datetime(),
    complete: z.boolean(),
    source: z.literal("MANUAL"),
    // Historical replay records predate owner attestation and remain unknown.
    adultMoney: moneySchema.nullable().default(null),
  })
  .strict()
  .refine(validAdultPortion, "Adult portion must match the recorded balance");
export const sharingSchema = z
  .object({
    membershipId: z.uuid().nullable(),
    level: grantLevelSchema,
    version: z.number().int().nonnegative(),
  })
  .strict();
export const accountSchema = z
  .object({
    id: z.uuid(),
    householdId: z.uuid(),
    label: z.string(),
    kind: accountKindSchema,
    currency: z.literal("GBP"),
    legalOwnerKind: z.enum(["ADULT", "JOINT_ADULT"]),
    liquidity: liquiditySchema,
    version: z.number().int().positive(),
    source: z.literal("MANUAL"),
    ownership: z.enum(["OWNED", "SHARED"]),
    access: z.enum(["TOTALS", "TRANSACTIONS"]),
    latestValuation: valuationSchema.nullable(),
    sharing: sharingSchema.nullable(),
    permissions: z
      .object({
        canEdit: z.boolean(),
        canValue: z.boolean(),
        canShare: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type AccountResponse = z.infer<typeof accountSchema>;
export const accountListSchema = z
  .object({ items: z.array(accountSchema), nextCursor: z.string().nullable() })
  .strict();
export const accountListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
export const accountCursorSchema = z
  .object({ id: z.uuid(), createdAt: z.iso.datetime() })
  .strict();
export const quotedVersionSchema = z
  .string()
  .regex(/^"(?:0|[1-9]\d{0,9})"$/)
  .transform((value) => Number(value.slice(1, -1)))
  .refine((value) => value <= 2147483647);
export interface AuthContext {
  userId: string;
  membershipId: string;
  householdId: string;
  sessionId: string;
  grantVersion: number;
  requestId: string;
  aal: "aal1" | "aal2";
  mfaAuthenticatedAt: number | null;
}
