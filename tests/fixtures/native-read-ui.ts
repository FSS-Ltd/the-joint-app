import { existsSync } from "node:fs";
import { expect } from "vitest";
import * as contracts from "../../packages/contracts/src/index.js";
import * as money from "../../packages/domain/src/index.js";
import * as aggregate from "../../packages/domain/src/cash-flow.js";
import {
  accountSchema,
  type AccountResponse,
} from "../../packages/contracts/src/index.js";
import { jsxBoundary, sourceExports } from "./native-source-harness.js";
const base = "apps/mobile/src/features/";
export const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const householdId = "00000000-0000-4000-8000-000000000001";
const native = {
  View: "view",
  FlatList: "list",
  Pressable: "pressable",
  ScrollView: "scrollview",
  StyleSheet: { create: <T>(styles: T) => styles },
};
const common = {
  "react/jsx-runtime": jsxBoundary,
  "react-native": native,
  "@joint/contracts": contracts,
  "@joint/domain": money,
  "@joint/domain/cash-flow": aggregate,
  "@/components/app-text": { AppText: "text" },
  "@/components/empty-state": { EmptyState: "empty" },
  "@/components/native-action": { NativeAction: "action" },
  "@/components/native-actions": { NativeActions: "actions" },
  "@/components/panel": { Panel: "panel" },
  "@/components/screen": { Screen: "screen" },
  "@/components/brand-mark": { BrandMark: "brand" },
  "@/theme/tokens": { colors: {}, corners: {}, spacing: {} },
};
export function load(path: string, deps: Record<string, unknown> = {}) {
  expect(existsSync(base + path), `missing implementation: ${path}`).toBe(true);
  return sourceExports(base + path, { ...common, ...deps });
}
export function account(
  overrides: Partial<AccountResponse> = {},
): AccountResponse {
  return accountSchema.parse({
    id,
    householdId,
    label: "Current account",
    kind: "CURRENT",
    currency: "GBP",
    legalOwnerKind: "ADULT",
    liquidity: "AVAILABLE",
    version: 1,
    source: "MANUAL",
    ownership: "OWNED",
    access: "TRANSACTIONS",
    latestValuation: null,
    sharing: { membershipId: null, level: "NONE", version: 0 },
    permissions: { canEdit: true, canValue: true, canShare: true },
    ...overrides,
  });
}
export function text(tree: unknown): string {
  return JSON.stringify(tree);
}
