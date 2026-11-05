import { existsSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { account, load, text } from "./fixtures/native-read-ui.js";
import { press } from "./fixtures/native-source-harness.js";
import { parseAccountRouteId } from "../apps/mobile/src/features/accounts/route-id.js";
it("owner links exist only for authoritative allowed operations", () => {
  const push = vi.fn();
  const Actions = load("accounts/owner-actions.tsx", {
    "expo-router": { useRouter: () => ({ push }) },
  }).OwnerActions as (props: {
    account: ReturnType<typeof account>;
  }) => unknown;
  const item = account();
  const tree = Actions({ account: item });
  press(tree, "Edit account details");
  expect(push).toHaveBeenLastCalledWith(`/home/accounts/${item.id}/edit`);
  press(tree, "Record a valuation");
  expect(push).toHaveBeenLastCalledWith(`/home/accounts/${item.id}/valuation`);
  press(tree, "Account sharing");
  expect(push).toHaveBeenLastCalledWith(`/home/accounts/${item.id}/sharing`);
  expect(Actions({ account: account({ ownership: "SHARED" }) })).toBe(null);
  expect(
    text(
      Actions({
        account: account({
          permissions: { canEdit: false, canValue: false, canShare: false },
        }),
      }),
    ),
  ).not.toContain("Record a valuation");
});
it("write routes reuse the UUID boundary without mounting forbidden malformed targets", () => {
  for (const file of [
    "new",
    "[accountId]/edit",
    "[accountId]/valuation",
    "[accountId]/sharing",
  ])
    expect(
      existsSync(`apps/mobile/app/(workspace)/home/accounts/${file}.tsx`),
    ).toBe(true);
  const Route = load("accounts/account-route.tsx", {
    "expo-router": {
      useLocalSearchParams: () => ({ accountId: [account().id] }),
      useRouter: () => ({ replace: vi.fn() }),
    },
    "./detail-screen": { AccountDetailScreen: "detail" },
    "./route-id": { parseAccountRouteId },
  }).AccountRoute as (props: { screen: unknown }) => unknown;
  expect(text(Route({ screen: "write-screen" }))).not.toContain("write-screen");
});
