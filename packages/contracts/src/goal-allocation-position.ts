import { z } from "zod";
import { aggregateMoneySchema } from "./reporting-primitives.js";

const nonnegative = aggregateMoneySchema.refine(
  ({ amountMinor }) => BigInt(amountMinor) >= 0n,
);
const knownPosition = z
  .object({
    accountId: z.uuid(),
    status: z.enum(["FUNDED", "UNDERFUNDED"]),
    reason: z.null(),
    available: nonnegative,
    committed: nonnegative,
    allocated: nonnegative,
    shortfall: nonnegative,
  })
  .strict()
  .refine((value) => {
    const available = BigInt(value.available.amountMinor),
      committed = BigInt(value.committed.amountMinor),
      shortfall = BigInt(value.shortfall.amountMinor);
    return (
      committed >= BigInt(value.allocated.amountMinor) &&
      shortfall === (committed > available ? committed - available : 0n) &&
      (value.status === "FUNDED") === (shortfall === 0n)
    );
  });

export const allocationPositionSchema = z.union([
  knownPosition,
  z
    .object({
      accountId: z.uuid(),
      status: z.literal("UNAVAILABLE"),
      reason: z.literal("FUNDING_UNAVAILABLE"),
      available: z.null(),
      committed: z.null(),
      allocated: z.null(),
      shortfall: z.null(),
    })
    .strict(),
]);
export type AllocationPosition = z.infer<typeof allocationPositionSchema>;
