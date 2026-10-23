import { NotFoundException } from "@nestjs/common";
import {
  accountSchema,
  type AccountResponse,
  type AuthContext,
} from "@joint/contracts";
import type { Prisma } from "@joint/database/client";

export const accountInclude = {
  owners: { where: { status: "ACTIVE" } },
  grants: true,
  balances: {
    take: 1,
    orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }, { id: "asc" }],
  },
} satisfies Prisma.AccountInclude;
export type AccountRow = Prisma.AccountGetPayload<{
  include: typeof accountInclude;
}>;

export async function partnerMembership(
  tx: Prisma.TransactionClient,
  context: AuthContext,
): Promise<string | null> {
  const partner = await tx.membership.findFirst({
    where: {
      householdId: context.householdId,
      status: "ACTIVE",
      id: { not: context.membershipId },
      user: { status: "ACTIVE" },
    },
    select: { id: true },
  });
  return partner?.id ?? null;
}

export function projectAccount(
  row: AccountRow,
  context: AuthContext,
  partnerId: string | null,
): AccountResponse {
  const owned = row.owners.some(
    (owner) =>
      owner.userId === context.userId &&
      owner.membershipId === context.membershipId,
  );
  const access = owned
    ? "TRANSACTIONS"
    : row.grants.find((grant) => grant.membershipId === context.membershipId)
        ?.level;
  if (!access || access === "NONE") throw new NotFoundException();
  const grant = row.grants.find((entry) => entry.membershipId === partnerId);
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
    ownership: owned ? "OWNED" : "SHARED",
    access,
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
    sharing: owned
      ? {
          membershipId: partnerId,
          level: grant?.level ?? "NONE",
          version: grant?.version ?? 0,
        }
      : null,
    permissions: {
      canEdit: owned,
      canValue: owned,
      canShare: owned && partnerId !== null,
    },
  });
}

export async function readAccount(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  accountId: string,
): Promise<AccountResponse> {
  const row = await tx.account.findFirst({
    where: {
      id: accountId,
      householdId: context.householdId,
      archivedAt: null,
    },
    include: accountInclude,
  });
  if (!row) throw new NotFoundException();
  return projectAccount(row, context, await partnerMembership(tx, context));
}
