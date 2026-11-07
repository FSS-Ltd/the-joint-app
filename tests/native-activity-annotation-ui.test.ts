import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import * as contracts from "../packages/contracts/src/index.js";
import * as domain from "../packages/domain/src/cash-flow.js";
import * as inputs from "../apps/mobile/src/features/activity/annotation-input.js";
import * as splits from "../apps/mobile/src/features/activity/split-input.js";
import * as labels from "../apps/mobile/src/features/activity/kind-labels.js";
import { load } from "./fixtures/native-read-ui.js";
import {
  byLabel,
  expand,
  press,
  session,
} from "./fixtures/native-activity-ui.js";

const base: contracts.TransactionResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  accountId: "e237d3d7-236f-4ec3-8454-c4e5504d397f",
  bookedDate: "2026-11-04",
  money: { amountMinor: "-125", currency: "GBP" },
  description: "Synthetic coffee",
  source: "MANUAL",
  version: 3,
  createdAt: "2026-11-04T10:00:00.000Z",
  category: null,
  classificationKind: null,
  effectiveKind: null,
  classificationConfirmed: false,
  splits: [],
  transfer: null,
  merchant: null,
  note: { body: null, version: 0 },
  permissions: { canCorrect: true, canClassify: true, canNote: true },
};
function annotation(tx: contracts.TransactionResponse) {
  const state = session(tx, inputs.annotationDraft(tx));
  const tree = (
    load("activity/annotation-screen.tsx", {
      "@joint/contracts": contracts,
      "@/components/native-field": { NativeField: "field" },
      "../accounts/account-choice": { AccountChoice: "choice" },
      "./annotation-input": inputs,
      "./kind-labels": labels,
      "./transaction-write-boundary": { TransactionWriteBoundary: "boundary" },
      "./use-annotation-write": { useAnnotationWrite: () => state },
    }).AnnotationScreen as (props: { transactionId: string }) => unknown
  )({ transactionId: tx.id });
  return { state, tree };
}
function splitScreen(
  tx: contracts.TransactionResponse,
  value = splits.splitsDraft(tx),
) {
  const state = session(tx, value);
  const tree = (
    load("activity/split-screen.tsx", {
      "@joint/contracts": contracts,
      "@joint/domain/cash-flow": domain,
      "@/components/native-field": { NativeField: "field" },
      "../accounts/account-choice": { AccountChoice: "choice" },
      "./kind-labels": labels,
      "./split-input": splits,
      "./transaction-write-boundary": { TransactionWriteBoundary: "boundary" },
      "./use-split-write": { useSplitWrite: () => state },
    }).SplitScreen as (props: { transactionId: string }) => unknown
  )({ transactionId: tx.id });
  return { state, tree };
}
function boundary(state: ReturnType<typeof session>, mutation = "idle") {
  const replace = vi.fn();
  const shared = load("writes/entity-write-boundary.tsx", {
    "expo-router": { useRouter: () => ({ replace }) },
    "../accounts/write-feedback": { WriteFeedback: "feedback" },
    "./use-entity-write": {},
  });
  const tree = (
    load("activity/transaction-write-boundary.tsx", {
      "@joint/domain/cash-flow": domain,
      "../writes/entity-write-boundary": shared,
      "./use-transaction-write": {},
    }).TransactionWriteBoundary as (props: unknown) => unknown
  )({
    session: { ...state, mutation: { kind: mutation } },
    transactionId: base.id,
    title: "Title",
    children: { type: "form", props: { label: "FORM" } },
  });
  // The wrapper only forwards to the shared boundary; render that boundary's own output.
  const element = tree as {
    type: (props: unknown) => unknown;
    props: unknown;
  };
  return { tree: element.type(element.props), replace };
}

it("annotation saves through the session and exposes every permitted field", () => {
  const { state, tree } = annotation(base);
  press(tree, "Save changes");
  expect(state.submit).toHaveBeenCalledOnce();
  for (const label of ["Category", "Classification", "Merchant", "Your note"])
    expect(byLabel(tree, label), label).toBeDefined();
});

it("annotation locks category and kind on a paired row but leaves merchant and note editable", () => {
  const { tree } = annotation({
    ...base,
    transfer: { confirmed: true, id: base.id, canRemove: true },
  });
  expect(byLabel(tree, "Category")?.editable).toBe(false);
  expect(byLabel(tree, "Classification")?.disabled).toBe(true);
  expect(byLabel(tree, "Merchant")?.editable).toBe(true);
  expect(byLabel(tree, "Your note")?.editable).toBe(true);
});

it("split screen edits exact amounts, shows what is left and saves through the session", () => {
  const tx = {
    ...base,
    money: { amountMinor: "-1000", currency: "GBP" as const },
  };
  const { state, tree } = splitScreen(tx, {
    lines: [
      { category: "", amount: "-7.05", classificationKind: "EXPENSE" },
      { category: "", amount: "", classificationKind: "EXPENSE" },
    ],
  });
  expect(JSON.stringify(expand(tree).map((e) => e.props.children))).toContain(
    "Left to allocate",
  );
  const amount = byLabel(tree, "Component 2 amount in GBP")?.onChangeText as (
    value: string,
  ) => void;
  amount("-2.95");
  expect(state.draft.change).toHaveBeenCalledWith({
    lines: [
      { category: "", amount: "-7.05", classificationKind: "EXPENSE" },
      { category: "", amount: "-2.95", classificationKind: "EXPENSE" },
    ],
  });
  press(tree, "Save split");
  expect(state.submit).toHaveBeenCalledWith();
  expect(expand(tree).some((e) => e.props.label === "Clear split")).toBe(false);
});

it("split screen adds up to twenty components, removes beyond two and clears an existing split explicitly", () => {
  const saved = {
    ...base,
    money: { amountMinor: "-1000", currency: "GBP" as const },
    splits: ["-500", "-300", "-200"].map((amountMinor, position) => ({
      id: `2222222${position}-2222-4222-8222-222222222222`,
      position,
      category: null,
      money: { amountMinor, currency: "GBP" as const },
      classificationKind: "EXPENSE" as const,
    })),
  };
  const { state, tree } = splitScreen(saved);
  press(tree, "Remove component 3");
  expect(state.draft.change).toHaveBeenCalledWith({
    lines: splits.splitsDraft(saved).lines.slice(0, 2),
  });
  press(tree, "Clear split");
  expect(state.submit).toHaveBeenCalledWith({ lines: [] });
  const full = splitScreen(saved, {
    lines: Array.from(
      { length: 20 },
      () => splits.splitsDraft(saved).lines[0]!,
    ),
  });
  expect(byLabel(full.tree, "Add component")?.disabled).toBe(true);
});

it("boundary offers an explicit reload instead of a blank screen after the draft is cleared", () => {
  const state = session(base, {});
  state.draft.base = null as never;
  const { tree } = boundary(state);
  expect(expand(tree).some((e) => e.props.label === "FORM")).toBe(false);
  press(tree, "Reload transaction");
  expect(state.reload).toHaveBeenCalledOnce();
});

it("boundary hides the form after success and shows the form while editing", () => {
  const state = session(base, {});
  expect(
    expand(boundary(state, "success").tree).some(
      (e) => e.props.label === "FORM",
    ),
  ).toBe(false);
  expect(
    expand(boundary(state).tree).some((e) => e.props.label === "FORM"),
  ).toBe(true);
});

it("boundary shows view-only with a way back, access errors with a retry, and checking while hidden", () => {
  const viewer = session(base, {}, { allowed: false });
  const view = boundary(viewer);
  press(view.tree, "Back to transaction");
  expect(view.replace).toHaveBeenCalledWith(`/activity/${base.id}`);
  const failed = session(base, {}, { read: { kind: "error", message: "x" } });
  press(boundary(failed).tree, "Retry transaction access");
  expect(failed.reload).toHaveBeenCalledOnce();
  const hidden = session(base, {});
  hidden.draft.visible = false;
  expect(JSON.stringify(boundary(hidden).tree)).toContain("Checking access");
});

it("wires detail entries, thin routes and stack screens without polling", () => {
  const root = "apps/mobile";
  const detail = readFileSync(
    `${root}/src/features/activity/transaction-detail-screen.tsx`,
    "utf8",
  );
  expect(detail).toContain("Edit classification and note");
  expect(detail).toContain("Split across categories");
  for (const [route, screen] of [
    ["annotate", "AnnotationScreen"],
    ["splits", "SplitScreen"],
  ] as const) {
    expect(
      readFileSync(
        `${root}/app/(workspace)/activity/[transactionId]/${route}.tsx`,
        "utf8",
      ),
    ).toContain(`screen={${screen}}`);
    expect(
      readFileSync(`${root}/app/(workspace)/activity/_layout.tsx`, "utf8"),
    ).toContain(`[transactionId]/${route}`);
  }
  for (const file of [
    "annotation-screen.tsx",
    "split-screen.tsx",
    "transaction-write-boundary.tsx",
    "use-transaction-write.ts",
  ])
    expect(
      readFileSync(`${root}/src/features/activity/${file}`, "utf8"),
    ).not.toMatch(/setInterval|setTimeout/);
});
