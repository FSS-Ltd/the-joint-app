import type { MeResponse } from "@joint/contracts";
import {
  captureResourceScope,
  type NativeResourceScope,
} from "../../events/scope";
import type { VerifiedNativeIdentity } from "../identity/controller";

export type NativeFinanceAuthority = Omit<NativeResourceScope, "selector">;

/** The rendered identity must be the exact currently verified controller result. */
export function captureFinanceAuthority(
  verified: VerifiedNativeIdentity | null,
  me: MeResponse,
): NativeFinanceAuthority | null {
  if (!verified || verified.me !== me || !me.membership) return null;
  const scope = captureResourceScope({
    actor: verified.actor,
    userId: me.user.id,
    membershipId: me.membership.id,
    householdId: me.membership.householdId,
    grantVersion: me.membership.grantVersion,
    selector: {
      kind: "accounts",
      householdId: me.membership.householdId,
      limit: 50,
    },
  });
  return Object.freeze({
    actor: scope.actor,
    userId: scope.userId,
    membershipId: scope.membershipId,
    householdId: scope.householdId,
    grantVersion: scope.grantVersion,
  });
}
export function financeAuthorityKey(authority: NativeFinanceAuthority): string {
  return JSON.stringify([
    authority.actor,
    authority.userId,
    authority.membershipId,
    authority.householdId,
    authority.grantVersion,
  ]);
}
export function sameFinanceAuthority(
  left: NativeFinanceAuthority | null,
  right: NativeFinanceAuthority | null,
): boolean {
  return left === null || right === null
    ? left === right
    : financeAuthorityKey(left) === financeAuthorityKey(right);
}
