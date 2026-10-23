import { createHash } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { AccountResponse, AuthContext } from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
export interface ScopeAccount {
  id: string;
  label: string;
  kind: AccountResponse["kind"];
  version: number;
  owned: boolean;
}
export function scopeHash(accountIds: readonly string[]): string {
  return createHash("sha256")
    .update([...accountIds].sort().join(","))
    .digest("hex");
}
export async function resolveReportScope(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  accountIds?: readonly string[],
): Promise<ScopeAccount[]> {
  if (
    accountIds &&
    (accountIds.length < 1 ||
      accountIds.length > 50 ||
      new Set(accountIds).size !== accountIds.length)
  )
    throw new BadRequestException({ error: { code: "INVALID_SCOPE" } });
  const rows = await tx.$queryRaw<
    ScopeAccount[]
  >`SELECT a.id,a.label,a.kind,a.version,app.owns_account(a.id) AS owned FROM app."Account" a WHERE a."householdId"=${context.householdId}::uuid AND a."archivedAt" IS NULL AND app.account_access(a.id,'TRANSACTIONS') AND (${accountIds === undefined} OR a.id=ANY(${accountIds ? [...accountIds] : []}::uuid[])) ORDER BY a.id LIMIT 51`;
  if (accountIds && rows.length !== accountIds.length)
    throw new NotFoundException();
  if (rows.length > 50)
    throw new BadRequestException({
      error: { code: "SCOPE_SELECTION_REQUIRED" },
    });
  return rows;
}
