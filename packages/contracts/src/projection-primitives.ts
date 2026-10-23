import { z } from "zod";
import { moneySchema } from "./accounts.js";
import { bookedDateSchema } from "./financial-input.js";

export const positiveVersionSchema = z.number().int().min(1).max(2147483647);
export const nonnegativeMoneySchema = moneySchema.refine(
  ({ amountMinor }) => !amountMinor.startsWith("-"),
  "Amount must be nonnegative",
);
export const calendarDateSchema = bookedDateSchema;
export const timestampSchema = z.iso
  .datetime()
  .refine((value) => !value.startsWith("0000-"));
export const monthEndDateSchema = calendarDateSchema.refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  return day === new Date(Date.UTC(year!, month!, 0)).getUTCDate();
}, "Date must be a month end");
export const monthEndWithinHorizon = (
  date: string,
  months: number,
): boolean => {
  const [year, month] = date.split("-").map(Number);
  return year! * 12 + month! - 1 + months - 1 <= 9999 * 12 + 11;
};

const canonicalDecimalSchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d?)(?:\.\d{0,11}[1-9])?$/)
  .refine((value) => value !== "-0");

function scaledRate(value: string): bigint {
  const sign = value.startsWith("-") ? -1n : 1n;
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  return (
    sign *
    (BigInt(whole!) * 1_000_000_000_000n +
      BigInt(fraction.padEnd(12, "0") || "0"))
  );
}

export const fractionSchema = z.string().regex(/^(?:1|0\.\d{0,11}[1-9])$/);

export const grossAnnualRateSchema = canonicalDecimalSchema.pipe(
  z
    .string()
    .refine(
      (value) =>
        scaledRate(value) >= -1_000_000_000_000n &&
        scaledRate(value) <= 1_000_000_000_000n,
    ),
);
export const proportionalAnnualRateSchema = canonicalDecimalSchema.pipe(
  z
    .string()
    .refine(
      (value) =>
        scaledRate(value) >= 0n && scaledRate(value) < 1_000_000_000_000n,
    ),
);
export const inflationAnnualRateSchema = canonicalDecimalSchema.pipe(
  z
    .string()
    .refine(
      (value) =>
        scaledRate(value) > -1_000_000_000_000n &&
        scaledRate(value) <= 1_000_000_000_000n,
    ),
);

export const rateProvenanceSchema = z
  .object({
    sourceKind: z.enum(["USER", "VERIFIED_PROVIDER", "ILLUSTRATION"]),
    sourceRef: z.string().min(1).max(200).nullable(),
    effectiveDate: calendarDateSchema,
    convention: z.literal("EFFECTIVE_ANNUAL"),
  })
  .strict()
  .refine((value) =>
    value.sourceKind === "VERIFIED_PROVIDER"
      ? value.sourceRef !== null
      : value.sourceRef === null,
  );

export const valuationReferenceSchema = z
  .object({
    accountId: z.uuid(),
    valuationId: z.uuid(),
    asOfDate: calendarDateSchema,
    source: z.literal("MANUAL"),
  })
  .strict();

export const sourceRevisionSchema = z
  .object({
    datasetVersion: positiveVersionSchema,
    grantVersion: z.number().int().nonnegative().max(2147483647),
    valuations: z.array(valuationReferenceSchema).max(50),
  })
  .strict();
