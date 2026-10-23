import { valuationSchema, type AccountResponse } from "@joint/contracts";
import type { Prisma } from "@joint/database/client";

type ValuationRecord = Prisma.BalanceSnapshotGetPayload<Record<string, never>>;

export function projectValuation(
  snapshot: ValuationRecord,
): NonNullable<AccountResponse["latestValuation"]> {
  return valuationSchema.parse({
    id: snapshot.id,
    money: {
      amountMinor: snapshot.amountMinor.toString(),
      currency: snapshot.currency,
    },
    adultMoney:
      snapshot.adultAmountMinor === null
        ? null
        : {
            amountMinor: snapshot.adultAmountMinor.toString(),
            currency: snapshot.currency,
          },
    asOfDate: snapshot.asOfDate.toISOString().slice(0, 10),
    recordedAt: snapshot.createdAt.toISOString(),
    complete: snapshot.complete,
    source: snapshot.source,
  });
}
