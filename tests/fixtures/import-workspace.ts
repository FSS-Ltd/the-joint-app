import type { Page } from "@playwright/test";
import {
  importReviewSchema,
  type ImportBatchResponse,
  type NormalizedCsvRow,
} from "../../packages/contracts/dist/index.js";
import {
  accountWorkspaceFixture,
  accounts,
  householdId,
} from "./account-workspace.js";
const first = accounts[0];
if (!first) throw Error("Missing synthetic import account");
export const importAccount = first;
export const importBatch: ImportBatchResponse = {
  id: "77777777-7777-4777-8777-000000000001",
  accountId: first.id,
  state: "READY",
  version: 1,
  totalRows: 4,
  processedRows: 4,
  validRows: 3,
  rejectedRows: 1,
  overlapRows: 1,
  duplicateRows: 1,
  committedRows: 0,
  skippedRows: 0,
  failureCode: null,
  createdAt: "2026-10-22T12:00:00.000Z",
  committedAt: null,
  rolledBackAt: null,
  originalExpiresAt: "2026-10-29T12:00:00.000Z",
  originalAvailable: true,
  permissions: {
    canCommit: true,
    canRollback: false,
    canRestore: false,
    canDeleteOriginal: true,
  },
};
const valid = {
  rowNumber: 1,
  status: "VALID",
  money: { amountMinor: "-1200", currency: "GBP" },
  bookedDate: "2026-10-22",
  description: "Cafe sample",
  sourceId: "sample-1",
  sourceHash: "a".repeat(64),
  fingerprint: "b".repeat(64),
  decision: "KEEP",
  duplicate: false,
  overlaps: [],
} satisfies NormalizedCsvRow;
export const importRows: NormalizedCsvRow[] = [
  valid,
  {
    ...valid,
    rowNumber: 2,
    sourceId: null,
    description: "Possible overlap sample",
    decision: "REVIEW",
    overlaps: [
      {
        transactionId: "66666666-6666-4666-8666-000000000001",
        bookedDate: valid.bookedDate,
        description: "Earlier cafe sample",
        money: valid.money,
      },
    ],
  },
  {
    ...valid,
    rowNumber: 3,
    description: "Stable duplicate sample",
    duplicate: true,
    decision: "SKIP",
    money: { amountMinor: "10000", currency: "GBP" },
  },
  { rowNumber: 4, status: "REJECTED", reason: "INVALID_DATE" },
];
export function importState(
  state: ImportBatchResponse["state"],
): ImportBatchResponse {
  return {
    ...importBatch,
    state,
    committedRows: state === "COMMITTED" ? 2 : 0,
    skippedRows: state === "COMMITTED" ? 1 : 0,
    committedAt: state === "COMMITTED" ? "2026-10-22T13:00:00.000Z" : null,
    permissions: {
      canCommit: state === "READY",
      canRollback: state === "COMMITTED",
      canRestore: state === "ROLLED_BACK",
      canDeleteOriginal: true,
    },
  };
}
export async function importWorkspaceFixture(page: Page): Promise<{
  setBatch: (batch: ImportBatchResponse) => void;
  setRows: (rows: NormalizedCsvRow[]) => void;
  fail: (value: boolean) => void;
  writes: string[];
}> {
  await accountWorkspaceFixture(page);
  let batch = structuredClone(importBatch),
    rows = structuredClone(importRows),
    failure = false;
  const writes: string[] = [];
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { csrfToken: "synthetic-csrf" } }),
  );
  await page.route(`**/api/households/${householdId}/imports**`, (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (failure)
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: "UNAVAILABLE",
            message: "Import temporarily unavailable.",
          },
        },
      });
    if (request.method() !== "GET")
      writes.push(`${request.method()} ${url.pathname}`);
    if (url.pathname.endsWith("/inspect"))
      return route.fulfill({
        json: {
          rowCount: 4,
          columns: [
            { index: 0, label: "Date" },
            { index: 1, label: "Description" },
            { index: 2, label: "Amount" },
            { index: 3, label: "Credit" },
          ],
        },
      });
    if (url.pathname.endsWith("/preview"))
      return route.fulfill({ json: { batch, jobId: null } });
    if (url.pathname.endsWith("/review")) {
      const body: unknown = request.postDataJSON();
      const { decisions } = importReviewSchema.parse(body);
      rows = rows.map((row) => {
        const decision = decisions.find(
          (item) => item.rowNumber === row.rowNumber,
        );
        return row.status === "VALID" && decision
          ? { ...row, decision: decision.decision }
          : row;
      });
      batch = { ...batch, version: batch.version + 1 };
      return route.fulfill({ json: batch });
    }
    if (url.pathname.endsWith("/rows"))
      return route.fulfill({ json: { items: rows, nextOffset: null } });
    if (url.pathname.endsWith("/imports"))
      return route.fulfill({
        json: {
          items: [
            url.searchParams.has("cursor")
              ? { ...batch, id: "77777777-7777-4777-8777-000000000002" }
              : batch,
          ],
          nextCursor: url.searchParams.has("cursor") ? null : "synthetic-next",
        },
      });
    if (url.pathname.endsWith(`/${batch.id}`))
      return route.fulfill({ json: batch });
    return route.fulfill({
      status: 404,
      json: {
        error: {
          code: "NOT_FOUND",
          message: "Synthetic import route unavailable.",
        },
      },
    });
  });
  return {
    setBatch: (value) => {
      batch = value;
    },
    setRows: (value) => {
      rows = value;
    },
    fail: (value) => {
      failure = value;
    },
    writes,
  };
}
