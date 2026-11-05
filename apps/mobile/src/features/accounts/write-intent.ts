import {
  accountCreateSchema,
  accountPatchSchema,
  grantInputSchema,
  idempotencyKeySchema,
  valuationInputSchema,
  type AccountResponse,
  type ValuationInput,
} from "@joint/contracts";
import type { NativeFinanceContextValue } from "../finance/context";
import { NativeApiError } from "../finance/errors";
import { assertFinanceResult } from "../finance/result";
import type { MetadataDraft } from "./write-input";

export type AccountWrite =
  | { kind: "metadata"; input: MetadataDraft }
  | { kind: "valuation"; input: ValuationInput; key: string }
  | {
      kind: "sharing";
      input: { level: NonNullable<AccountResponse["sharing"]>["level"] };
    };
export type AccountOperation = AccountWrite["kind"];
export function canWriteAccount(
  account: AccountResponse,
  operation: AccountOperation,
): boolean {
  return (
    account.ownership === "OWNED" &&
    account.permissions[
      operation === "metadata"
        ? "canEdit"
        : operation === "valuation"
          ? "canValue"
          : "canShare"
    ]
  );
}
function capturedAuthority(finance: NativeFinanceContextValue) {
  const authority = finance.authority;
  if (!authority || !finance.isCurrent(authority))
    throw new NativeApiError(409, "AUTHORITY_CHANGED");
  return authority;
}
function assertActive(
  finance: NativeFinanceContextValue,
  authority: NonNullable<NativeFinanceContextValue["authority"]>,
  signal: AbortSignal,
): void {
  if (signal.aborted || !finance.isCurrent(authority))
    throw new NativeApiError(409, "AUTHORITY_CHANGED");
}
function verifyWritten(
  value: AccountResponse,
  authority: NonNullable<NativeFinanceContextValue["authority"]>,
  accountId?: string,
): void {
  try {
    assertFinanceResult(value, {
      ...authority,
      selector: accountId
        ? { kind: "account", householdId: authority.householdId, id: accountId }
        : { kind: "accounts", householdId: authority.householdId, limit: 50 },
    });
  } catch {
    // A dispatched mutation may have committed even when its response is untrustworthy.
    throw new NativeApiError(409, "RESOURCE_MISMATCH", "uncertain");
  }
}
export function createAccountIntent(
  finance: NativeFinanceContextValue,
  input: ReturnType<typeof accountCreateSchema.parse>,
  requestKey: string,
): (signal: AbortSignal) => Promise<AccountResponse> {
  const authority = capturedAuthority(finance);
  const dto = Object.freeze(accountCreateSchema.parse(input));
  const key = idempotencyKeySchema.parse(requestKey);
  return async (signal) => {
    assertActive(finance, authority, signal);
    const value = await finance.accounts.create(
      authority.householdId,
      dto,
      key,
      signal,
    );
    verifyWritten(value, authority);
    return value;
  };
}
export function accountWriteIntent(
  finance: NativeFinanceContextValue,
  account: AccountResponse,
  write: AccountWrite,
): (signal: AbortSignal) => Promise<AccountResponse> {
  const authority = capturedAuthority(finance);
  if (
    account.householdId !== authority.householdId ||
    !canWriteAccount(account, write.kind)
  )
    throw new NativeApiError(403, "AUTHORITY_CHANGED");
  const id = account.id,
    version = account.version;
  let execute: (signal: AbortSignal) => Promise<AccountResponse>;
  if (write.kind === "metadata") {
    const dto = Object.freeze(accountPatchSchema.parse(write.input));
    execute = (signal) =>
      finance.accounts.patch(authority.householdId, id, dto, version, signal);
  } else if (write.kind === "valuation") {
    const parsed = valuationInputSchema.parse(write.input);
    const dto = Object.freeze({
      ...parsed,
      money: Object.freeze(parsed.money),
      ...(parsed.adultMoney
        ? { adultMoney: Object.freeze(parsed.adultMoney) }
        : {}),
    });
    const key = idempotencyKeySchema.parse(write.key);
    execute = (signal) =>
      finance.accounts.value(
        authority.householdId,
        id,
        dto,
        key,
        version,
        signal,
      );
  } else {
    const membershipId = account.sharing?.membershipId,
      grantVersion = account.sharing?.version;
    if (!membershipId || grantVersion === undefined)
      throw new NativeApiError(403, "AUTHORITY_CHANGED");
    const dto = Object.freeze(grantInputSchema.parse(write.input));
    execute = (signal) =>
      finance.accounts.setGrant(
        authority.householdId,
        id,
        membershipId,
        dto,
        grantVersion,
        signal,
      );
  }
  const sharing = write.kind === "sharing";
  return async (signal) => {
    assertActive(finance, authority, signal);
    const value = await execute(signal);
    verifyWritten(value, authority, id);
    if (sharing) {
      assertActive(finance, authority, signal);
      try {
        await finance.reconcile(authority);
      } catch {
        throw new NativeApiError(0, undefined, "uncertain");
      }
    }
    return value;
  };
}
