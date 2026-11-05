import { statusSubscriptionQuery } from "@joint/contracts";
import type { NativeResourceScope } from "../../events/scope";
import type { NativeIdentityController } from "../identity/controller";
import { NativeApiError } from "./errors";
import {
  captureFinanceAuthority,
  financeAuthorityKey,
  type NativeFinanceAuthority,
} from "./scope";

type Refusal = {
  status: number;
  code: "INVALID_CURSOR" | "AUTHORITY_CHANGED" | undefined;
};
const maximumRefusals = 32;
const maximumCursors = 64;

/** Runtime-owned metadata survives ready-subtree removal. It retains no response, intent or credential. */
export class NativeFinanceResourceMemory {
  private authorityKey: string | null = null;
  private readonly refusals = new Map<string, Refusal>();
  private readonly cursors = new Set<string>();
  private overflow: { key: string; refusal: Refusal } | null = null;

  activate(authority: NativeFinanceAuthority): void {
    const key = financeAuthorityKey(authority);
    if (key === this.authorityKey) return;
    this.clear();
    this.authorityKey = key;
  }
  clear(): void {
    this.authorityKey = null;
    this.refusals.clear();
    this.cursors.clear();
    this.overflow = null;
  }
  private current(scope: NativeResourceScope): boolean {
    return this.authorityKey === financeAuthorityKey(scope);
  }
  canUseCursor(scope: NativeResourceScope): boolean {
    return (
      this.current(scope) &&
      (scope.selector.kind !== "accounts" ||
        scope.selector.cursor === undefined ||
        this.cursors.has(scope.selector.cursor))
    );
  }
  refusal(scope: NativeResourceScope): NativeApiError | null {
    if (!this.current(scope)) return null;
    const key = statusSubscriptionQuery(scope.selector);
    const refusal =
      this.refusals.get(key) ??
      (this.overflow?.key === key ? this.overflow.refusal : null);
    return refusal
      ? new NativeApiError(refusal.status, refusal.code)
      : this.overflow
        ? new NativeApiError(403)
        : null;
  }

  /** Returns true only when this denial may trigger its single identity reconciliation. */
  refuse(scope: NativeResourceScope, error: NativeApiError): boolean {
    if (!this.current(scope)) return false;
    const key = statusSubscriptionQuery(scope.selector);
    if (this.refusals.has(key) || this.overflow) return false;
    const refusal: Refusal = {
      status: error.status,
      code:
        error.code === "INVALID_CURSOR" || error.code === "AUTHORITY_CHANGED"
          ? error.code
          : undefined,
    };
    if (this.refusals.size === maximumRefusals) {
      // One overflow marker blocks new automatic work instead of evicting refusals into a loop.
      this.overflow = { key, refusal };
    } else this.refusals.set(key, refusal);
    return true;
  }
  success(scope: NativeResourceScope, value: unknown): void {
    if (!this.current(scope)) return;
    const key = statusSubscriptionQuery(scope.selector);
    const recovered = this.refusals.delete(key);
    if (this.overflow?.key === key) this.overflow = null;
    else if (recovered && this.overflow) {
      this.refusals.set(this.overflow.key, this.overflow.refusal);
      this.overflow = null;
    }
    if (
      scope.selector.kind !== "accounts" ||
      typeof value !== "object" ||
      value === null ||
      !("nextCursor" in value) ||
      typeof value.nextCursor !== "string" ||
      !value.nextCursor ||
      value.nextCursor.length > 2048
    )
      return;
    const cursor = value.nextCursor;
    this.cursors.delete(cursor);
    this.cursors.add(cursor);
    if (this.cursors.size > maximumCursors) {
      const oldest = this.cursors.values().next().value;
      if (oldest !== undefined) this.cursors.delete(oldest);
    }
  }
}

/** This subscription belongs above IdentityEntry's conditional ready subtree. */
export function observeFinanceResourceAuthority(
  identity: Pick<
    NativeIdentityController,
    "getSnapshot" | "getVerifiedIdentity" | "subscribe"
  >,
  memory: NativeFinanceResourceMemory,
): () => void {
  const reconcile = () => {
    const verified = identity.getVerifiedIdentity();
    if (verified) {
      const authority = captureFinanceAuthority(verified, verified.me);
      if (authority) memory.activate(authority);
    } else {
      const state = identity.getSnapshot();
      if (
        state.kind === "signed-out" ||
        state.kind === "household-required" ||
        state.kind === "security-required" ||
        (state.kind === "locked" && state.reason === "expired")
      )
        memory.clear();
    }
  };
  reconcile();
  const unsubscribe = identity.subscribe(reconcile);
  return () => {
    unsubscribe();
    memory.clear();
  };
}
