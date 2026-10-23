import { z } from "zod";
import { aggregateMoneySchema } from "./reporting-primitives.js";
import { monthlyContributionSchema } from "./goals.js";
import {
  grossAnnualRateSchema,
  inflationAnnualRateSchema,
  monthEndDateSchema,
  monthEndWithinHorizon,
  nonnegativeMoneySchema,
  positiveVersionSchema,
  proportionalAnnualRateSchema,
  rateProvenanceSchema,
  sourceRevisionSchema,
  timestampSchema,
} from "./projection-primitives.js";

const inputCommon = {
  schema: z.literal("projection-input"),
  schemaVersion: z.literal(1),
  opening: nonnegativeMoneySchema,
  target: nonnegativeMoneySchema,
  targetBasis: z.enum(["FIXED_NOMINAL", "TODAYS_MONEY"]),
  firstContributionDate: monthEndDateSchema,
  horizonMonths: z.number().int().min(1).max(600),
  monthlyContributions: z.array(monthlyContributionSchema).min(1).max(600),
};
const scheduledMoneySchema = z
  .object({
    month: z.number().int().min(1).max(600),
    amount: nonnegativeMoneySchema,
  })
  .strict();
const nonnegativeAggregateMoneySchema = aggregateMoneySchema.refine(
  ({ amountMinor }) => !amountMinor.startsWith("-"),
);
const scheduleWithinHorizon = (input: {
  horizonMonths: number;
  monthlyContributions: { fromMonth: number }[];
}) =>
  input.monthlyContributions[0]?.fromMonth === 1 &&
  input.monthlyContributions.every(
    (entry, i) =>
      entry.fromMonth <= input.horizonMonths &&
      (i === 0 ||
        entry.fromMonth > input.monthlyContributions[i - 1]!.fromMonth),
  );
const validInputCalendar = (input: {
  firstContributionDate: string;
  horizonMonths: number;
  monthlyContributions: { fromMonth: number }[];
}) =>
  monthEndWithinHorizon(input.firstContributionDate, input.horizonMonths) &&
  scheduleWithinHorizon(input);

const basicInputSchema = z
  .object({
    ...inputCommon,
    mode: z.literal("BASIC"),
    targetBasis: z.literal("FIXED_NOMINAL"),
  })
  .strict()
  .refine(validInputCalendar);
const advancedInputSchema = z
  .object({
    ...inputCommon,
    mode: z.literal("ADVANCED"),
    scenarioId: z.uuid(),
    withdrawals: z.array(scheduledMoneySchema).max(600),
    fixedFees: z.array(scheduledMoneySchema).max(600),
    tax: z.array(scheduledMoneySchema).max(600),
    grossAnnualRate: grossAnnualRateSchema,
    proportionalFeeAnnualRate: proportionalAnnualRateSchema,
    inflationAnnualRate: inflationAnnualRateSchema,
    rateProvenance: z
      .object({
        growth: rateProvenanceSchema,
        fee: rateProvenanceSchema,
        inflation: rateProvenanceSchema,
      })
      .strict(),
  })
  .strict()
  .refine(
    (input) =>
      validInputCalendar(input) &&
      [input.withdrawals, input.fixedFees, input.tax].every((entries) =>
        entries.every(
          (entry, i) =>
            entry.month <= input.horizonMonths &&
            (i === 0 || entry.month > entries[i - 1]!.month),
        ),
      ),
  );

export const projectionInputV1Schema = z.union([
  basicInputSchema,
  advancedInputSchema,
]);
export type ProjectionInputV1 = z.infer<typeof projectionInputV1Schema>;

export const projectionResultV1Schema = z
  .object({
    schema: z.literal("projection-result"),
    schemaVersion: z.literal(1),
    status: z.enum([
      "already_achieved",
      "reachable",
      "insufficient_inputs",
      "budget_deficit",
      "depleted",
      "unreachable_under_assumptions",
      "beyond_horizon",
    ]),
    firstQualifyingDate: monthEndDateSchema.nullable(),
    series: z
      .array(
        z
          .object({
            month: z.number().int().min(1).max(600),
            date: monthEndDateSchema,
            closing: nonnegativeAggregateMoneySchema,
            target: nonnegativeAggregateMoneySchema,
          })
          .strict(),
      )
      .max(600),
    breakdown: z
      .object({
        opening: nonnegativeAggregateMoneySchema,
        contributions: nonnegativeAggregateMoneySchema,
        withdrawals: nonnegativeAggregateMoneySchema,
        growth: aggregateMoneySchema,
        proportionalFees: nonnegativeAggregateMoneySchema,
        fixedFees: nonnegativeAggregateMoneySchema,
        tax: nonnegativeAggregateMoneySchema,
        closing: nonnegativeAggregateMoneySchema,
      })
      .strict(),
    warnings: z
      .array(
        z.enum([
          "PARTIAL_SOURCE",
          "STALE_VALUATION",
          "UNMODELLED_TAX",
          "UNMODELLED_FEES",
          "UNFUNDED_CONTRIBUTION",
          "ILLUSTRATIVE_RATE",
        ]),
      )
      .max(20),
  })
  .strict();
export type ProjectionResultV1 = z.infer<typeof projectionResultV1Schema>;

export const scenarioDtoSchema = z
  .object({
    schema: z.literal("scenario"),
    schemaVersion: z.literal(1),
    id: z.uuid(),
    householdId: z.uuid(),
    goalId: z.uuid(),
    version: positiveVersionSchema,
    input: advancedInputSchema,
    createdAt: timestampSchema,
  })
  .strict()
  .refine((scenario) => scenario.id === scenario.input.scenarioId);
export type ScenarioDto = z.infer<typeof scenarioDtoSchema>;

export const projectionRunDtoSchema = z
  .object({
    schema: z.literal("projection-run"),
    schemaVersion: z.literal(1),
    id: z.uuid(),
    householdId: z.uuid(),
    goalId: z.uuid(),
    scenarioId: z.uuid().nullable(),
    mode: z.enum(["BASIC", "ADVANCED"]),
    input: projectionInputV1Schema,
    result: projectionResultV1Schema,
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    engineVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    roundingConvention: z.literal("HALF_UP_MINOR_UNIT"),
    source: sourceRevisionSchema,
    createdAt: timestampSchema,
  })
  .strict()
  .refine(
    (run) =>
      run.mode === run.input.mode &&
      (run.input.mode === "BASIC"
        ? run.scenarioId === null
        : run.scenarioId === run.input.scenarioId),
  );
export type ProjectionRunDto = z.infer<typeof projectionRunDtoSchema>;
