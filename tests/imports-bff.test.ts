import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readCsvBody } from "../apps/web/lib/server/csv-body.js";

describe("bounded raw CSV transport", () => {
  it("preserves quoted UTF-8 bytes without a JSON or base64 expansion", async () => {
    const bytes = new TextEncoder().encode(
      'Date,Description,Amount\n2026-10-23,"Café, books\nand more",-12.34\n',
    );
    const request = new Request("http://127.0.0.1/api/imports/inspect", {
      method: "POST",
      headers: { "Content-Type": "text/csv;charset=UTF-8" },
      body: bytes,
    });
    expect(new Uint8Array(await readCsvBody(request))).toEqual(bytes);
  });
  it("accepts the exact 10 MiB bound and rejects an oversized streamed body", async () => {
    const exact = new Uint8Array(10 * 1024 * 1024).fill(65);
    expect(
      (
        await readCsvBody(
          new Request("http://127.0.0.1/csv", {
            method: "POST",
            headers: { "Content-Type": "text/csv" },
            body: exact,
          }),
        )
      ).byteLength,
    ).toBe(exact.byteLength);
    const oversized = new Uint8Array(exact.byteLength + 1).fill(65);
    await expect(
      readCsvBody(
        new Request("http://127.0.0.1/csv", {
          method: "POST",
          headers: { "Content-Type": "text/csv" },
          body: oversized,
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("rejects JSON, unsupported encodings and empty bodies safely", async () => {
    for (const contentType of ["application/json", "text/csv;charset=latin1"]) {
      await expect(
        readCsvBody(
          new Request("http://127.0.0.1/csv", {
            method: "POST",
            headers: { "Content-Type": contentType },
            body: "private-csv-sentinel",
          }),
        ),
      ).rejects.toMatchObject({ status: 415 });
    }
    await expect(
      readCsvBody(
        new Request("http://127.0.0.1/csv", {
          method: "POST",
          headers: { "Content-Type": "text/csv" },
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

import {
  uploadCsv,
  listImports,
  readImport,
  mutateImport,
} from "../apps/web/lib/server/import-routes.js";
import {
  createTransaction,
  getTransaction,
  listTransactions,
  patchTransaction,
} from "../apps/web/lib/server/transaction-routes.js";
const householdId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";
const batchId = "33333333-3333-4333-8333-333333333333";
const token = "s".repeat(43);
const csrf = "c".repeat(43);
const mapping = {
  date: 0,
  description: 1,
  amount: 2,
  debit: null,
  credit: null,
  currency: null,
  sourceId: null,
  dateFormat: "ISO",
  decimalSeparator: "DOT",
  amountMode: "SIGNED",
  positiveIs: "INFLOW",
};
const batch = {
  id: batchId,
  accountId,
  state: "READY",
  version: 1,
  totalRows: 1,
  processedRows: 1,
  validRows: 1,
  rejectedRows: 0,
  overlapRows: 0,
  duplicateRows: 0,
  committedRows: 0,
  skippedRows: 0,
  failureCode: null,
  createdAt: "2026-10-23T00:00:00.000Z",
  committedAt: null,
  rolledBackAt: null,
  originalExpiresAt: "2026-10-24T00:00:00.000Z",
  originalAvailable: true,
  permissions: {
    canCommit: true,
    canRollback: false,
    canRestore: false,
    canDeleteOriginal: true,
  },
};
const transaction = {
  id: batchId,
  accountId,
  bookedDate: "2026-10-23",
  money: { amountMinor: "-1234", currency: "GBP" },
  description: "Synthetic purchase",
  source: "MANUAL",
  version: 1,
  createdAt: "2026-10-23T00:00:00.000Z",
  category: null,
  classificationKind: null,
  effectiveKind: "EXPENSE",
  classificationConfirmed: false,
  splits: [],
  transfer: null,
  merchant: null,
  note: { body: null, version: 0 },
  permissions: { canCorrect: true, canClassify: true, canNote: true },
};
let value: unknown;
let status: number;
let forwarded: { url: string; init: RequestInit }[];
function boundaryRequest(
  options: {
    body?: unknown;
    raw?: string;
    query?: string;
    headers?: Record<string, string>;
  } = {},
): Request {
  const mutation = options.body !== undefined || options.raw !== undefined;
  return new Request(`http://127.0.0.1:3000/api/local${options.query ?? ""}`, {
    method: mutation ? "POST" : "GET",
    headers: {
      Cookie: `joint-session=${token}; joint-csrf=${csrf}`,
      Origin: "http://127.0.0.1:3000",
      "X-CSRF-Token": csrf,
      "Content-Type":
        options.raw === undefined
          ? "application/json"
          : "text/csv;charset=UTF-8",
      "X-Account-Id": accountId,
      "X-Import-Mapping": encodeURIComponent(JSON.stringify(mapping)),
      "Idempotency-Key": batchId,
      "If-Match": '"1"',
      ...options.headers,
    },
    ...(mutation ? { body: options.raw ?? JSON.stringify(options.body) } : {}),
  });
}
beforeEach(() => {
  vi.stubEnv("WEB_ORIGIN", "http://127.0.0.1:3000");
  vi.stubEnv("API_BASE_URL", "http://127.0.0.1:3001");
  value = batch;
  status = 200;
  forwarded = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      forwarded.push({ url: String(input), init: init ?? {} });
      return Response.json(value, { status });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("import and activity BFF boundaries", () => {
  it("requires the opaque session and rejects path traversal before forwarding", async () => {
    expect(
      (
        await listImports(
          boundaryRequest({
            query: `?accountId=${accountId}`,
            headers: { Cookie: "" },
          }),
          householdId,
        )
      ).status,
    ).toBe(401);
    expect(
      (await readImport(boundaryRequest(), householdId, "../../auth/login"))
        .status,
    ).toBe(400);
    expect(
      (await getTransaction(boundaryRequest(), "not-a-household", batchId))
        .status,
    ).toBe(400);
    expect(forwarded).toHaveLength(0);
  });
  it("checks origin and CSRF before reading or forwarding every mutation", async () => {
    const invalidHeaders: Record<string, string>[] = [
      { Origin: "https://evil.example" },
      { "X-CSRF-Token": "incorrect" },
    ];
    for (const headers of invalidHeaders) {
      const req = () => boundaryRequest({ body: {}, headers });
      expect((await uploadCsv(req(), householdId, "inspect")).status).toBe(403);
      for (const operation of [
        "review",
        "commit",
        "rollback",
        "original",
      ] as const)
        expect(
          (await mutateImport(req(), householdId, batchId, operation)).status,
        ).toBe(403);
      expect((await createTransaction(req(), householdId)).status).toBe(403);
      expect((await patchTransaction(req(), householdId, batchId)).status).toBe(
        403,
      );
      expect(
        (await patchTransaction(req(), householdId, batchId, true)).status,
      ).toBe(403);
    }
    expect(forwarded).toHaveLength(0);
  });
  it("forwards exact raw CSV bytes and validated small metadata without browser cookies", async () => {
    const raw =
      'Date,Description,Amount\n2026-10-23,"Café, books\nand more",-12.34\n';
    value = { batch, jobId: batchId };
    const response = await uploadCsv(
      boundaryRequest({ raw }),
      householdId,
      "preview",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(forwarded[0]?.url).toBe(
      `http://127.0.0.1:3001/v1/households/${householdId}/imports/preview`,
    );
    const init = forwarded[0]?.init;
    expect(init?.method).toBe("POST");
    expect(init?.cache).toBe("no-store");
    expect(init?.redirect).toBe("error");
    expect(
      new TextDecoder().decode(
        init?.body instanceof ArrayBuffer ? init.body : undefined,
      ),
    ).toBe(raw);
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe(`Session ${token}`);
    expect(headers.get("Cookie")).toBeNull();
    expect(headers.get("X-Account-Id")).toBe(accountId);
    expect(headers.get("Idempotency-Key")).toBe(batchId);
    expect(headers.get("X-Import-Mapping")).toBe(
      encodeURIComponent(JSON.stringify(mapping)),
    );
  });
  it.each<Record<string, string>>([
    { "X-Account-Id": "invalid" },
    { "Idempotency-Key": "" },
    { "X-Import-Mapping": "%invalid" },
    {
      "X-Import-Mapping": encodeURIComponent(
        JSON.stringify({ ...mapping, amount: 0 }),
      ),
    },
    { "X-Import-Mapping": "x".repeat(4097) },
  ])("rejects invalid preview metadata before upstream", async (headers) => {
    expect(
      (
        await uploadCsv(
          boundaryRequest({ raw: "Date,Amount\n2026-10-23,1", headers }),
          householdId,
          "preview",
        )
      ).status,
    ).toBe(400);
    expect(forwarded).toHaveLength(0);
  });
  it("inspects with no mapping and validates the response shape", async () => {
    value = { columns: [{ index: 0, label: "Date" }], rowCount: 1 };
    expect(
      (
        await uploadCsv(
          boundaryRequest({
            raw: "Date\n2026-10-23",
            headers: { "X-Import-Mapping": "" },
          }),
          householdId,
          "inspect",
        )
      ).status,
    ).toBe(200);
    expect(
      new Headers(forwarded[0]?.init.headers).has("X-Import-Mapping"),
    ).toBe(false);
    value = { ...batch, privateSecret: "never-echo-sentinel" };
    const response = await readImport(boundaryRequest(), householdId, batchId);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("never-echo-sentinel");
  });
  it.each([
    "?limit=101",
    "?limit=1&limit=2",
    "?ownerId=other",
    "?accountId=bad",
  ])("rejects invalid import pagination %s", async (query) => {
    expect(
      (await listImports(boundaryRequest({ query }), householdId)).status,
    ).toBe(400);
    expect(forwarded).toHaveLength(0);
  });
  it.each([
    "?limit=101",
    "?offset=-1",
    "?filter=PRIVATE",
    "?filter=ALL&filter=REVIEW",
  ])("rejects invalid preview pagination %s", async (query) => {
    expect(
      (await readImport(boundaryRequest({ query }), householdId, batchId, true))
        .status,
    ).toBe(400);
    expect(forwarded).toHaveLength(0);
  });
  it("forwards bounded row filters and defaults", async () => {
    value = { items: [], nextOffset: null };
    expect(
      (
        await readImport(
          boundaryRequest({ query: "?offset=100&filter=REVIEW" }),
          householdId,
          batchId,
          true,
        )
      ).status,
    ).toBe(200);
    expect(forwarded[0]?.url).toContain("offset=100&limit=100&filter=REVIEW");
  });
  it("requires quoted versions and independent keys on review and commit", async () => {
    expect(
      (
        await mutateImport(
          boundaryRequest({
            body: { decisions: [{ rowNumber: 1, decision: "KEEP" }] },
            headers: { "If-Match": "1" },
          }),
          householdId,
          batchId,
          "review",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await mutateImport(
          boundaryRequest({
            body: { acceptRejectedRows: true },
            headers: { "Idempotency-Key": "" },
          }),
          householdId,
          batchId,
          "commit",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await mutateImport(
          boundaryRequest({
            body: { decisions: [{ rowNumber: 1, decision: "REVIEW" }] },
          }),
          householdId,
          batchId,
          "review",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await mutateImport(
          boundaryRequest({
            body: { decisions: [{ rowNumber: 1, decision: "KEEP" }] },
          }),
          householdId,
          batchId,
          "review",
        )
      ).status,
    ).toBe(200);
    expect(forwarded[0]?.init.method).toBe("PATCH");
    expect(new Headers(forwarded[0]?.init.headers).get("If-Match")).toBe('"1"');
    value = { batch, jobId: batchId };
    expect(
      (
        await mutateImport(
          boundaryRequest({ body: { acceptRejectedRows: true } }),
          householdId,
          batchId,
          "commit",
        )
      ).status,
    ).toBe(200);
    expect(new Headers(forwarded[1]?.init.headers).get("Idempotency-Key")).toBe(
      batchId,
    );
  });
  it("uses quoted versions for rollback and original deletion", async () => {
    expect(
      (await mutateImport(boundaryRequest(), householdId, batchId, "rollback"))
        .status,
    ).toBe(200);
    expect(forwarded[0]?.init.method).toBe("DELETE");
    expect(new Headers(forwarded[0]?.init.headers).get("If-Match")).toBe('"1"');
    expect(
      (await mutateImport(boundaryRequest(), householdId, batchId, "original"))
        .status,
    ).toBe(200);
    expect(forwarded[1]?.url).toMatch(/\/original$/);
  });
  it("preserves exact money and manual input while rejecting source/owner injection", async () => {
    value = transaction;
    const body = {
      accountId,
      bookedDate: transaction.bookedDate,
      money: transaction.money,
      description: transaction.description,
    };
    expect(
      (
        await createTransaction(
          boundaryRequest({ body: { ...body, source: "CSV" } }),
          householdId,
        )
      ).status,
    ).toBe(400);
    expect(
      (await createTransaction(boundaryRequest({ body }), householdId)).status,
    ).toBe(200);
    expect(forwarded[0]?.init.body).toBe(JSON.stringify(body));
    expect(
      (await getTransaction(boundaryRequest(), householdId, batchId)).status,
    ).toBe(200);
  });
  it("requires independent note version and limits annotation fields", async () => {
    value = transaction;
    for (const body of [
      { note: "private" },
      { noteVersion: 0 },
      { merchant: "x".repeat(121) },
      { ownerId: accountId, category: "Books" },
      { note: "private", noteVersion: 0, source: "MANUAL" },
    ])
      expect(
        (
          await patchTransaction(
            boundaryRequest({ body }),
            householdId,
            batchId,
            true,
          )
        ).status,
      ).toBe(400);
    const body = { note: "Synthetic author-only note", noteVersion: 0 };
    expect(
      (
        await patchTransaction(
          boundaryRequest({ body }),
          householdId,
          batchId,
          true,
        )
      ).status,
    ).toBe(200);
    expect(forwarded[0]?.init.body).toBe(JSON.stringify(body));
    expect(new Headers(forwarded[0]?.init.headers).get("If-Match")).toBe('"1"');
  });
  it("rejects unknown activity filters and unvalidated upstream data", async () => {
    expect(
      (
        await listTransactions(
          boundaryRequest({ query: `?accountId=${accountId}&limit=201` }),
          householdId,
        )
      ).status,
    ).toBe(400);
    value = { ...transaction, privateProviderToken: "never-echo-sentinel" };
    const response = await getTransaction(
      boundaryRequest(),
      householdId,
      batchId,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("never-echo-sentinel");
  });
  it("keeps protected rollback errors safe without echoing upstream details", async () => {
    status = 409;
    value = {
      error: {
        code: "IMPORT_PROTECTED",
        message: "private-provider-sentinel",
      },
    };
    const response = await mutateImport(
      boundaryRequest(),
      householdId,
      batchId,
      "rollback",
    );
    expect(response.status).toBe(409);
    const result = await response.text();
    expect(result).toContain("later changes or notes");
    expect(result).not.toContain("private-provider-sentinel");
  });
});

it("keeps CSV larger than the JSON limit in raw transport", async () => {
  value = { columns: [{ index: 0, label: "Description" }], rowCount: 1000 };
  const raw = `Description\n${"Synthetic source text\n".repeat(3000)}`;
  expect(new TextEncoder().encode(raw).byteLength).toBeGreaterThan(32 * 1024);
  expect(
    (await uploadCsv(boundaryRequest({ raw }), householdId, "inspect")).status,
  ).toBe(200);
  expect(forwarded[0]?.init.body).toBeInstanceOf(ArrayBuffer);
  expect(new Headers(forwarded[0]?.init.headers).get("Content-Type")).toBe(
    "text/csv; charset=UTF-8",
  );
});
