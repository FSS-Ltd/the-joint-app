import { NotFoundException } from "@nestjs/common";
import { accountSchema, type AccountResponse } from "@joint/contracts";
import type { Prisma } from "@joint/database/client";

export const archiveAccountInclude = {
  balances: {
    take: 1,
    orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }, { id: "asc" }],
  },
} satisfies Prisma.AccountInclude;

export function projectArchiveAccount(
  row: Prisma.AccountGetPayload<{ include: typeof archiveAccountInclude }>,
): AccountResponse {
  const snapshot = row.balances[0];
  return accountSchema.parse({
    id: row.id,
    householdId: row.householdId,
    label: row.label,
    kind: row.kind,
    currency: row.currency,
    legalOwnerKind: row.legalOwnerKind,
    liquidity: row.liquidity,
    version: row.version,
    source: "MANUAL",
    ownership: "OWNED",
    access: "TRANSACTIONS",
    latestValuation: snapshot
      ? {
          id: snapshot.id,
          money: {
            amountMinor: snapshot.amountMinor.toString(),
            currency: snapshot.currency,
          },
          asOfDate: snapshot.asOfDate.toISOString().slice(0, 10),
          recordedAt: snapshot.createdAt.toISOString(),
          complete: snapshot.complete,
          source: snapshot.source,
        }
      : null,
    sharing: null,
    permissions: { canEdit: false, canValue: false, canShare: false },
  });
}

/** Dedicated archive scope must be established before calling this helper. */
export async function readArchiveAccount(
  tx: Prisma.TransactionClient,
  accountId: string,
): Promise<AccountResponse> {
  const [authority] = await tx.$queryRaw<
    { allowed: boolean }[]
  >`SELECT app.archive_owns_account(${accountId}::uuid) AS allowed`;
  if (!authority?.allowed) throw new NotFoundException();
  const account = await tx.account.findUnique({
    where: { id: accountId },
    include: archiveAccountInclude,
  });
  if (!account) throw new NotFoundException();
  return projectArchiveAccount(account);
}
