import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import * as contracts from "../packages/contracts/src/index.js";
import * as domain from "../packages/domain/src/cash-flow.js";
import * as inputs from "../apps/mobile/src/features/activity/annotation-input.js";
import { load } from "./fixtures/native-read-ui.js";
import { elements, press } from "./fixtures/native-source-harness.js";

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
function screen(
  tx: contracts.TransactionResponse,
  mutation = "idle",
  cleared = false,
) {
  const state = {
    read: { kind: "ready", value: tx },
    draft: {
      base: cleared ? null : tx,
      value: inputs.annotationDraft(tx),
      message: "",
      visible: true,
      invalidated: false,
      change: vi.fn(),
    },
    mutation: { kind: mutation },
    allowed: true,
    editable: true,
    reload: vi.fn(),
    submit: vi.fn(),
  };
  const tree = (
    load("activity/annotation-screen.tsx", {
      "@joint/contracts": contracts,
      "@joint/domain/cash-flow": domain,
      "expo-router": { useRouter: () => ({ replace: vi.fn() }) },
      "@/components/native-field": { NativeField: "field" },
      "../accounts/account-choice": { AccountChoice: "choice" },
      "../accounts/write-feedback": { WriteFeedback: "feedback" },
      "./annotation-input": inputs,
      "./use-annotation-write": { useAnnotationWrite: () => state },
    }).AnnotationScreen as (props: { transactionId: string }) => unknown
  )({ transactionId: tx.id });
  return { state, tree };
}

it("saves through the session and exposes every permitted field", () => {
  const { state, tree } = screen(base);
  press(tree, "Save changes");
  expect(state.submit).toHaveBeenCalledOnce();
  const labels = elements(tree).map((e) => e.props.label);
  for (const label of ["Category", "Classification", "Merchant", "Your note"])
    expect(labels, label).toContain(label);
});

it("locks category and kind on a paired row but leaves merchant and note editable", () => {
  const { tree } = screen({
    ...base,
    transfer: { confirmed: true, id: base.id, canRemove: true },
  });
  const byLabel = (label: string) =>
    elements(tree).find((e) => e.props.label === label)?.props;
  expect(byLabel("Category")?.editable).toBe(false);
  expect(byLabel("Classification")?.disabled).toBe(true);
  expect(byLabel("Merchant")?.editable).toBe(true);
  expect(byLabel("Your note")?.editable).toBe(true);
});

it("offers an explicit reload instead of a blank screen after the draft is cleared", () => {
  const { state, tree } = screen(base, "idle", true);
  expect(elements(tree).some((e) => e.props.label === "Save changes")).toBe(
    false,
  );
  press(tree, "Reload transaction");
  expect(state.reload).toHaveBeenCalledOnce();
});

it("hides the form after success so the saved outcome is the only action", () => {
  const { tree } = screen(base, "success");
  expect(elements(tree).some((e) => e.props.label === "Save changes")).toBe(
    false,
  );
});

it("wires the detail entry, thin route and stack screen without polling", () => {
  const root = "apps/mobile";
  expect(
    readFileSync(
      `${root}/src/features/activity/transaction-detail-screen.tsx`,
      "utf8",
    ),
  ).toContain("Edit classification and note");
  expect(
    readFileSync(
      `${root}/app/(workspace)/activity/[transactionId]/annotate.tsx`,
      "utf8",
    ),
  ).toContain("screen={AnnotationScreen}");
  expect(
    readFileSync(`${root}/app/(workspace)/activity/_layout.tsx`, "utf8"),
  ).toContain("[transactionId]/annotate");
  for (const file of ["annotation-screen.tsx", "use-annotation-write.ts"])
    expect(
      readFileSync(`${root}/src/features/activity/${file}`, "utf8"),
    ).not.toMatch(/setInterval|setTimeout/);
});
