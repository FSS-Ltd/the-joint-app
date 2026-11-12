import { describe, expect, it, vi } from "vitest";
import { MAX_CSV_BYTES } from "../packages/contracts/src/index.js";
import { createImportsApi } from "../apps/mobile/src/api/imports.js";
import { createNativeTransport } from "./fixtures/native-api.js";
import { financeFixture } from "./fixtures/native-finance.js";

const householdId = "00000000-0000-4000-8000-000000000001";
const accountId = "e237d3d7-236f-4ec3-8454-c4e5504d397f";
const batchId = "11111111-1111-4111-8111-111111111111";
const key = "99999999-9999-4999-8999-999999999999";
const base = `https://api.example.test/v1/households/${householdId}/imports`;
const batch = {
  id: batchId,
  accountId,
  state: "READY",
  version: 3,
  totalRows: 2,
  processedRows: 2,
  validRows: 2,
  rejectedRows: 0,
  overlapRows: 0,
  duplicateRows: 0,
  committedRows: 0,
  skippedRows: 0,
  failureCode: null,
  createdAt: "2026-11-04T10:00:00.000Z",
  committedAt: null,
  rolledBackAt: null,
  originalExpiresAt: null,
  originalAvailable: true,
  permissions: {
    canCommit: true,
    canRollback: false,
    canRestore: false,
    canDeleteOriginal: true,
  },
};
const mapping = {
  date: 0,
  description: 1,
  amount: 2,
  debit: null,
  credit: null,
  currency: null,
  sourceId: null,
  dateFormat: "ISO" as const,
  decimalSeparator: "DOT" as const,
  amountMode: "SIGNED" as const,
  positiveIs: "INFLOW" as const,
};
function fixture(response: unknown = batch, status = 200) {
  const token = vi.fn(async () => "token");
  const send = vi.fn<typeof fetch>(async () =>
    Response.json(response, { status }),
  );
  const api = createImportsApi(
    createNativeTransport("https://api.example.test", token, send),
  );
  return { api, token, send, signal: new AbortController().signal };
}
/** Refusal may be a synchronous parse error or a rejection inside the transport. */
const refused = (call: () => unknown) =>
  expect((async () => call())()).rejects.toThrow();
const csv = (text: string) => new TextEncoder().encode(text);

describe("CSV upload transport", () => {
  it("sends the exact bytes as text/csv with the account header and no JSON body", async () => {
    const { api, send, signal } = fixture({
      columns: [{ index: 0, label: "Date" }],
      rowCount: 2,
    });
    const bytes = csv("Date,Description\n2026-11-01,Coffee\n");
    await api.inspect(householdId, accountId, bytes, signal);
    expect(send.mock.calls[0]?.[0]).toBe(`${base}/inspect?suggestMapping=1`);
    const init = send.mock.calls[0]?.[1];
    expect(init).toMatchObject({
      method: "POST",
      credentials: "omit",
      redirect: "error",
      headers: {
        "Content-Type": "text/csv; charset=UTF-8",
        "X-Account-Id": accountId,
        Authorization: "Bearer token",
      },
    });
    expect(new Uint8Array(init?.body as Uint8Array)).toEqual(bytes);
  });

  it("snapshots the bytes at call time so later mutation cannot change what is sent", async () => {
    let release: (value: string) => void = () => {};
    const send = vi.fn<typeof fetch>(async () =>
      Response.json({ columns: [{ index: 0, label: "Date" }], rowCount: 2 }),
    );
    const api = createImportsApi(
      createNativeTransport(
        "https://api.example.test",
        () => new Promise((resolve) => (release = resolve)),
        send,
      ),
    );
    const bytes = csv("a,b\n1,2\n");
    const pending = api.inspect(
      householdId,
      accountId,
      bytes,
      new AbortController().signal,
    );
    bytes.fill(0);
    release("token");
    await pending;
    expect(
      new TextDecoder().decode(send.mock.calls[0]?.[1]?.body as Uint8Array),
    ).toBe("a,b\n1,2\n");
  });

  it("rejects empty and oversized files before a token is requested or anything is sent", async () => {
    const { api, token, send, signal } = fixture();
    await refused(() =>
      api.inspect(householdId, accountId, new Uint8Array(0), signal),
    );
    await refused(() =>
      api.inspect(
        householdId,
        accountId,
        new Uint8Array(MAX_CSV_BYTES + 1),
        signal,
      ),
    );
    expect(token).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("accepts a file of exactly the maximum size", async () => {
    const { api, send, signal } = fixture({
      columns: [{ index: 0, label: "Date" }],
      rowCount: 1,
    });
    await api.inspect(
      householdId,
      accountId,
      new Uint8Array(MAX_CSV_BYTES).fill(97),
      signal,
    );
    expect(send).toHaveBeenCalledOnce();
  });

  it("previews with one encoded mapping header, the idempotency key and a 202 job result", async () => {
    const { api, send, signal } = fixture({ batch, jobId: key }, 202);
    const result = await api.preview(
      householdId,
      accountId,
      csv("a,b\n"),
      mapping,
      key,
      signal,
    );
    expect(result.batch.id).toBe(batchId);
    const headers = send.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(send.mock.calls[0]?.[0]).toBe(`${base}/preview`);
    expect(headers["Idempotency-Key"]).toBe(key);
    expect(
      JSON.parse(decodeURIComponent(headers["X-Import-Mapping"]!)),
    ).toEqual(mapping);
  });

  it("refuses an invalid mapping, account id or key before any request", async () => {
    const { api, send, signal } = fixture();
    const bytes = csv("a,b\n");
    await refused(() =>
      api.preview(
        householdId,
        accountId,
        bytes,
        { ...mapping, amount: null },
        key,
        signal,
      ),
    );
    await refused(() =>
      api.preview(householdId, "../x", bytes, mapping, key, signal),
    );
    await refused(() =>
      api.preview(householdId, accountId, bytes, mapping, "bad key", signal),
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("treats a lost preview upload as uncertain so it can only be replayed with the same key", async () => {
    const send = vi.fn<typeof fetch>(async () => {
      throw new TypeError("network");
    });
    const api = createImportsApi(
      createNativeTransport(
        "https://api.example.test",
        async () => "token",
        send,
      ),
    );
    await expect(
      api.preview(
        householdId,
        accountId,
        csv("a,b\n"),
        mapping,
        key,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ outcome: "uncertain" });
  });
});

describe("CSV upload guards", () => {
  const raw = { parse: (value: unknown) => value };
  const transport = () => {
    const send = vi.fn<typeof fetch>(async () => Response.json({}));
    return {
      send,
      request: createNativeTransport(
        "https://api.example.test",
        async () => "token",
        send,
      ).request,
      signal: new AbortController().signal,
    };
  };
  const bytes = csv("a,b\n1,2\n");

  it("refuses a mapping header that could carry header syntax or exceeds the cap", async () => {
    const t = transport();
    for (const mapping of ["a\r\nX-Evil: 1", "a:b", "a b", "", "é"])
      await expect(
        t.request("x", raw, {
          method: "POST",
          csv: { bytes, accountId, mapping },
          signal: t.signal,
        }),
      ).rejects.toMatchObject({ status: 0 });
    await expect(
      t.request("x", raw, {
        method: "POST",
        csv: { bytes, accountId, mapping: "a".repeat(8193) },
        signal: t.signal,
      }),
    ).rejects.toMatchObject({ status: 0 });
    await t.request("x", raw, {
      method: "POST",
      csv: { bytes, accountId, mapping: "a".repeat(8192) },
      signal: t.signal,
    });
    expect(t.send).toHaveBeenCalledOnce();
  });

  it("refuses an upload combined with a JSON body or any method other than POST", async () => {
    const t = transport();
    await expect(
      t.request("x", raw, {
        method: "POST",
        body: { a: 1 },
        csv: { bytes, accountId },
        signal: t.signal,
      }),
    ).rejects.toMatchObject({ status: 0 });
    for (const method of ["GET", "PATCH", "PUT", "DELETE"] as const)
      await expect(
        t.request("x", raw, {
          method,
          csv: { bytes, accountId },
          signal: t.signal,
        }),
      ).rejects.toMatchObject({ status: 0 });
    expect(t.send).not.toHaveBeenCalled();
  });

  it("refuses a malformed account id directly at the transport", async () => {
    const t = transport();
    await expect(
      t.request("x", raw, {
        method: "POST",
        csv: { bytes, accountId: "a\r\nHost: evil" },
        signal: t.signal,
      }),
    ).rejects.toBeDefined();
    expect(t.send).not.toHaveBeenCalled();
  });

  it("sends the preview with the same account header and content type as inspect", async () => {
    const { api, send, signal } = fixture({ batch, jobId: key }, 202);
    await api.preview(
      householdId,
      accountId,
      csv("a,b\n"),
      mapping,
      key,
      signal,
    );
    expect(send.mock.calls[0]?.[1]?.headers).toMatchObject({
      "Content-Type": "text/csv; charset=UTF-8",
      "X-Account-Id": accountId,
    });
  });
});

describe("CSV upload deadline", () => {
  function hanging() {
    const signals: AbortSignal[] = [];
    const send = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal as AbortSignal;
          signals.push(signal);
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const api = createImportsApi(
      createNativeTransport(
        "https://api.example.test",
        async () => "token",
        send,
      ),
    );
    return { api, signals };
  }

  it("lets a slow upload run past the 15 second JSON deadline, then aborts it as uncertain", async () => {
    vi.useFakeTimers();
    try {
      const { api, signals } = hanging();
      const pending = api.inspect(
        householdId,
        accountId,
        csv("a,b\n"),
        new AbortController().signal,
      );
      const outcome = pending.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(16_000);
      expect(signals[0]?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(110_000);
      expect(signals[0]?.aborted).toBe(true);
      expect(await outcome).toMatchObject({ outcome: "uncertain" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the 15 second deadline for ordinary JSON requests", async () => {
    vi.useFakeTimers();
    try {
      const { api, signals } = hanging();
      const pending = api
        .read(householdId, batchId, new AbortController().signal)
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(16_000);
      expect(signals[0]?.aborted).toBe(true);
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("imports adapter", () => {
  it("lists one bounded page per account", async () => {
    const { api, send, signal } = fixture({ items: [batch], nextCursor: null });
    await api.list(householdId, { accountId, limit: 20 }, signal);
    expect(send.mock.calls[0]?.[0]).toBe(
      `${base}?${new URLSearchParams({ accountId, limit: "20" })}`,
    );
  });

  it("reads a batch and its rows with explicit bounds", async () => {
    const { api, send, signal } = fixture(batch);
    await api.read(householdId, batchId, signal);
    expect(send.mock.calls[0]?.[0]).toBe(`${base}/${batchId}`);
    send.mockResolvedValueOnce(Response.json({ items: [], nextOffset: null }));
    await api.rows(
      householdId,
      batchId,
      { offset: 100, limit: 100, filter: "REVIEW" },
      signal,
    );
    expect(send.mock.calls[1]?.[0]).toBe(
      `${base}/${batchId}/rows?offset=100&limit=100&filter=REVIEW`,
    );
  });

  it("records decisions with the batch version and commits with a key and version", async () => {
    const { api, send, signal } = fixture(batch);
    await api.review(
      householdId,
      batchId,
      { decisions: [{ rowNumber: 3, decision: "KEEP" }] },
      3,
      signal,
    );
    expect(send.mock.calls[0]?.[0]).toBe(`${base}/${batchId}/review`);
    expect(send.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      headers: { "If-Match": '"3"' },
      body: '{"decisions":[{"rowNumber":3,"decision":"KEEP"}]}',
    });
    send.mockResolvedValueOnce(
      Response.json({ batch, jobId: key }, { status: 202 }),
    );
    await api.commit(
      householdId,
      batchId,
      { acceptRejectedRows: false },
      key,
      3,
      signal,
    );
    expect(send.mock.calls[1]?.[0]).toBe(`${base}/${batchId}/commit`);
    expect(send.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      headers: { "If-Match": '"3"', "Idempotency-Key": key },
      body: '{"acceptRejectedRows":false}',
    });
  });

  it("rolls back and deletes the original with DELETE, a version and no body", async () => {
    const { api, send, signal } = fixture(batch);
    await api.rollback(householdId, batchId, 4, signal);
    await api.deleteOriginal(householdId, batchId, 4, signal);
    expect(send.mock.calls[0]?.[0]).toBe(`${base}/${batchId}`);
    expect(send.mock.calls[1]?.[0]).toBe(`${base}/${batchId}/original`);
    for (const call of send.mock.calls) {
      expect(call[1]).toMatchObject({
        method: "DELETE",
        headers: { "If-Match": '"4"' },
      });
      expect(call[1]?.body).toBeUndefined();
    }
  });

  it("rejects malformed ids, decisions and bounds before any request", async () => {
    const { api, send, signal } = fixture(batch);
    await refused(() => api.read(householdId, "../x", signal));
    await refused(() =>
      api.review(householdId, batchId, { decisions: [] }, 3, signal),
    );
    await refused(() =>
      api.rows(
        householdId,
        batchId,
        { offset: 0, limit: 101, filter: "ALL" },
        signal,
      ),
    );
    await refused(() => api.rollback(householdId, batchId, 2147483648, signal));
    expect(send).not.toHaveBeenCalled();
  });
});

it("is available on the finance context beside the other adapters", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const f = await financeFixture();
  for (const name of [
    "inspect",
    "preview",
    "list",
    "read",
    "rows",
    "review",
    "commit",
    "rollback",
    "deleteOriginal",
  ] as const)
    expect(typeof f.finance.imports[name], name).toBe("function");
  f.close();
  vi.useRealTimers();
});
