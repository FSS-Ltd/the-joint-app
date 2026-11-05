import { expect, it } from "vitest";
import { NativeFinanceResourceMemory } from "../apps/mobile/src/features/finance/resource-memory.js";
import { NativeApiError } from "../apps/mobile/src/api/errors.js";
import { scope } from "./fixtures/native-stream.js";
import type { NativeFinanceAuthority } from "../apps/mobile/src/features/finance/scope.js";

const authority: NativeFinanceAuthority = scope;
const account = (i: number) => ({
  ...scope,
  selector: {
    kind: "account" as const,
    householdId: scope.householdId,
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  },
});

it("bounds refusals without evicting them into automatic reconciliation loops", () => {
  const memory = new NativeFinanceResourceMemory();
  memory.activate(authority);
  for (let i = 1; i <= 32; i++)
    expect(memory.refuse(account(i), new NativeApiError(404))).toBe(true);
  expect(memory.refuse(account(33), new NativeApiError(403))).toBe(true);
  expect(memory.refusal(account(1))?.status).toBe(404);
  expect(memory.refusal(account(34))?.status).toBe(403);
  expect(memory.refuse(account(33), new NativeApiError(403))).toBe(false);
  expect(memory.refuse(account(34), new NativeApiError(403))).toBe(false);
  memory.success(account(1), { id: account(1).selector.id });
  expect(memory.refusal(account(33))?.status).toBe(403);
  expect(memory.refusal(account(34))).toBeNull();
  expect(memory.refuse(account(34), new NativeApiError(403))).toBe(true);
});
it("bounds issued-cursor provenance and fails closed for unknown or evicted cursors", () => {
  const memory = new NativeFinanceResourceMemory();
  memory.activate(authority);
  for (let i = 1; i <= 65; i++)
    memory.success(scope, { nextCursor: `cursor-${i}` });
  const page = (cursor: string) => ({
    ...scope,
    selector: { ...scope.selector, cursor },
  });
  expect(memory.canUseCursor(page("cursor-1"))).toBe(false);
  expect(memory.canUseCursor(page("cursor-2"))).toBe(true);
  expect(memory.canUseCursor(page("cursor-65"))).toBe(true);
  expect(memory.canUseCursor(page("unissued"))).toBe(false);
  expect(memory.canUseCursor(scope)).toBe(true);
});
it.each([
  { actor: "replacement:session" },
  { userId: "00000000-0000-4000-8000-000000000099" },
  { membershipId: "00000000-0000-4000-8000-000000000099" },
  { householdId: "00000000-0000-4000-8000-000000000099" },
  { grantVersion: 1 },
])(
  "clears authority-scoped markers on replacement %j without recapturing old cursors",
  (change) => {
    const memory = new NativeFinanceResourceMemory();
    memory.activate(authority);
    memory.success(scope, { nextCursor: "prior-authority" });
    memory.refuse(account(1), new NativeApiError(404));
    const next = { ...authority, ...change };
    memory.activate(next);
    const nextAccount = {
      ...account(1),
      ...next,
      selector: { ...account(1).selector, householdId: next.householdId },
    };
    expect(memory.refusal(nextAccount)).toBeNull();
    expect(memory.refuse(account(1), new NativeApiError(404))).toBe(false);
    expect(
      memory.canUseCursor({
        ...next,
        selector: {
          kind: "accounts",
          householdId: next.householdId,
          limit: 50,
          cursor: "prior-authority",
        },
      }),
    ).toBe(false);
  },
);
it("retains the overflow refusal until its own successful retry without evicting earlier denials", () => {
  const memory = new NativeFinanceResourceMemory();
  memory.activate(authority);
  for (let i = 1; i <= 33; i++)
    memory.refuse(account(i), new NativeApiError(404));
  memory.success(account(34), { id: account(34).selector.id });
  expect(memory.refusal(account(35))?.status).toBe(403);
  memory.success(account(33), { id: account(33).selector.id });
  expect(memory.refusal(account(33))).toBeNull();
  expect(memory.refusal(account(35))).toBeNull();
  expect(memory.refusal(account(1))?.status).toBe(404);
});
