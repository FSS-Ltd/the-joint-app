import { z } from "zod";
import { moneySchema } from "./accounts.js";
import { timestampSchema } from "./projection-primitives.js";
const nonnegativeMoney = moneySchema.refine(
  (value) => BigInt(value.amountMinor) >= 0n,
);
export const fundingEvidenceWriteSchema = z
  .object({
    valuationId: z.uuid(),
    settledAdultMoney: nonnegativeMoney,
    billReserves: nonnegativeMoney,
  })
  .strict();
export type FundingEvidenceWrite = z.infer<typeof fundingEvidenceWriteSchema>;
export const fundingEvidenceDtoSchema = fundingEvidenceWriteSchema.extend({
  id: z.uuid(),
  householdId: z.uuid(),
  accountId: z.uuid(),
  version: z.number().int().positive().max(2147483647),
  createdAt: timestampSchema,
});
export type FundingEvidenceDto = z.infer<typeof fundingEvidenceDtoSchema>;
export const fundingEvidenceQuerySchema = z
  .object({ cursor: z.string().min(1).max(4096).optional() })
  .strict();
export const fundingEvidenceRawPageSchema = z
  .object({
    current: fundingEvidenceDtoSchema.nullable(),
    history: z.array(fundingEvidenceDtoSchema).max(50),
    nextAfterVersion: z.number().int().positive().max(2147483647).nullable(),
  })
  .strict();
export const fundingEvidencePageSchema = fundingEvidenceRawPageSchema
  .omit({ nextAfterVersion: true })
  .extend({ nextCursor: z.string().max(4096).nullable() });
export type FundingEvidencePage = z.infer<typeof fundingEvidencePageSchema>;
