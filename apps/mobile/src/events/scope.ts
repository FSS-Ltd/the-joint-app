import {
  idempotencyKeySchema,
  statusSubscriptionSchema,
  statusSubscriptionQuery,
  type StatusSubscription,
} from "@joint/contracts";

/** Supplied only after identity verifies internal membership and provider session. */
export interface NativeResourceScope {
  readonly actor: string;
  readonly userId: string;
  readonly membershipId: string;
  readonly householdId: string;
  readonly grantVersion: number;
  readonly selector: Extract<
    StatusSubscription,
    { kind: "account" | "accounts" | "wealth" | "transactions" }
  >;
}

export function captureResourceScope(
  scope: NativeResourceScope,
): NativeResourceScope {
  const selector = statusSubscriptionSchema.parse(scope.selector);
  if (
    (selector.kind !== "account" &&
      selector.kind !== "accounts" &&
      selector.kind !== "wealth" &&
      selector.kind !== "transactions") ||
    selector.householdId !== scope.householdId ||
    !scope.actor ||
    !Number.isSafeInteger(scope.grantVersion) ||
    scope.grantVersion < 0
  )
    throw new Error("Invalid native resource scope");
  return Object.freeze({
    actor: scope.actor,
    userId: idempotencyKeySchema.parse(scope.userId),
    membershipId: idempotencyKeySchema.parse(scope.membershipId),
    householdId: idempotencyKeySchema.parse(scope.householdId),
    grantVersion: scope.grantVersion,
    selector: Object.freeze(selector),
  });
}

export function sameResourceScope(
  left: NativeResourceScope | null,
  right: NativeResourceScope | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.actor === right.actor &&
    left.userId === right.userId &&
    left.membershipId === right.membershipId &&
    left.householdId === right.householdId &&
    left.grantVersion === right.grantVersion &&
    statusSubscriptionQuery(left.selector) ===
      statusSubscriptionQuery(right.selector)
  );
}
