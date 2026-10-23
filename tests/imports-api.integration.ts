import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  csvInspectionSchema,
  importJobResultSchema,
  importRowsSchema,
  MAX_CSV_BYTES,
  transactionSchema,
} from "../packages/contracts/dist/index.js";
import { createImportsHttpFixture } from "./fixtures/imports-http.js";

it("imports equal purchases, requires reject/overlap decisions, preserves lineage and protects owner-only previews", async () => {
  const fixture = await createImportsHttpFixture();
  const {
    root,
    accountId,
    actorToken,
    memberToken,
    outsiderToken,
    otherHouseholdId,
    memberId,
    request,
    batch,
    preview,
    progress,
    ledger,
    uploadHeaders,
  } = fixture;
  try {
    const csv =
      "date,description,amount\n2026-01-01,Equal purchase,-12.34\n2026-01-01,Equal purchase,-12.34\nnot-a-date,Rejected row,-1.00\n";
    const inspection = await request(
      `${root}/imports/inspect`,
      "POST",
      csv,
      actorToken,
      { "X-Account-Id": accountId },
    );
    expect(inspection.status).toBe(200);
    expect(csvInspectionSchema.parse(await inspection.json())).toMatchObject({
      rowCount: 3,
      columns: [
        { index: 0, label: "date" },
        { index: 1, label: "description" },
        { index: 2, label: "amount" },
      ],
    });
    let current = await preview(csv);
    expect(current).toMatchObject({
      state: "READY",
      validRows: 2,
      rejectedRows: 1,
    });
    const path = `${root}/imports/${current.id}`;
    const rows = importRowsSchema.parse(
      await (await request(`${path}/rows?filter=REJECTED&limit=1`)).json(),
    );
    expect(rows.items).toEqual([
      { rowNumber: 3, status: "REJECTED", reason: "INVALID_DATE" },
    ]);
    expect(await ledger()).toEqual([]);
    const commit = (acceptRejectedRows: boolean) =>
      request(`${path}/commit`, "POST", { acceptRejectedRows }, actorToken, {
        "Idempotency-Key": randomUUID(),
        "If-Match": `"${current.version}"`,
      });
    expect((await commit(false)).status).toBe(409);
    expect((await commit(true)).ok).toBe(true);
    expect(await ledger()).toEqual([]);
    await progress(current.id);
    current = await batch(current.id);
    expect(current).toMatchObject({ state: "COMMITTED", committedRows: 2 });
    const originals = await ledger();
    expect(originals).toHaveLength(2);
    expect(new Set(originals.map((row) => row.id)).size).toBe(2);
    expect(originals.map((row) => row.money.amountMinor)).toEqual([
      "-1234",
      "-1234",
    ]);
    const replay = await request(
      `${root}/imports/preview`,
      "POST",
      csv,
      actorToken,
      uploadHeaders(),
    );
    expect(replay.ok).toBe(true);
    expect(importJobResultSchema.parse(await replay.json()).batch.id).toBe(
      current.id,
    );
    expect((await commit(true)).ok).toBe(true);
    expect((await ledger()).map((row) => row.id)).toEqual(
      originals.map((row) => row.id),
    );
    expect(
      (
        await request(path, "DELETE", undefined, actorToken, {
          "If-Match": `"${current.version}"`,
        })
      ).ok,
    ).toBe(true);
    current = await batch(current.id);
    expect(current.state).toBe("ROLLED_BACK");
    expect(await ledger()).toEqual([]);
    expect((await commit(true)).ok).toBe(true);
    await progress(current.id);
    current = await batch(current.id);
    expect((await ledger()).map((row) => row.id)).toEqual(
      originals.map((row) => row.id),
    );
    const first = originals[0];
    if (!first) throw new Error("Expected imported purchase");
    const originalCorrection = await request(
      `${root}/transactions/${first.id}`,
      "PATCH",
      {
        bookedDate: "2026-01-02",
        money: { amountMinor: "-9999", currency: "GBP" },
        description: "Forbidden CSV overwrite",
      },
      actorToken,
      { "If-Match": `"${first.version}"` },
    );
    expect(originalCorrection.ok).toBe(false);
    expect(
      (await ledger()).find((row) => row.id === first.id)?.money.amountMinor,
    ).toBe("-1234");
    const annotation = await request(
      `${root}/transactions/${first.id}/annotation`,
      "PATCH",
      { category: "Food", note: "Owner private note", noteVersion: 0 },
      actorToken,
      { "If-Match": `"${first.version}"` },
    );
    expect(annotation.ok).toBe(true);
    expect(
      (
        await request(path, "DELETE", undefined, actorToken, {
          "If-Match": `"${current.version}"`,
        })
      ).status,
    ).toBe(409);
    expect(await ledger()).toHaveLength(2);
    const overlap = await preview(
      "date,description,amount\n2026-01-01,Equal purchase,-12.34\n2026-01-01,Equal purchase,-12.34\n2026-01-02,New purchase,-5.00\n",
    );
    expect(overlap.overlapRows).toBe(2);
    const overlapPath = `${root}/imports/${overlap.id}`;
    expect(
      (
        await request(
          `${overlapPath}/commit`,
          "POST",
          { acceptRejectedRows: false },
          actorToken,
          {
            "Idempotency-Key": randomUUID(),
            "If-Match": `"${overlap.version}"`,
          },
        )
      ).status,
    ).toBe(409);
    const reviewed = await request(
      `${overlapPath}/review`,
      "PATCH",
      {
        decisions: [
          { rowNumber: 1, decision: "KEEP" },
          { rowNumber: 2, decision: "SKIP" },
        ],
      },
      actorToken,
      { "If-Match": `"${overlap.version}"` },
    );
    expect(reviewed.ok).toBe(true);
    const ready = await batch(overlap.id);
    expect(
      (
        await request(
          `${overlapPath}/commit`,
          "POST",
          { acceptRejectedRows: false },
          actorToken,
          { "Idempotency-Key": randomUUID(), "If-Match": `"${ready.version}"` },
        )
      ).ok,
    ).toBe(true);
    await progress(overlap.id);
    expect(await ledger()).toHaveLength(4);
    expect((await request(path, "GET", undefined, memberToken)).status).toBe(
      404,
    );
    expect((await request(path, "GET", undefined, outsiderToken)).status).toBe(
      404,
    );
    expect(
      (
        await request(
          `/households/${otherHouseholdId}/imports/${current.id}`,
          "GET",
          undefined,
          outsiderToken,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `${root}/transactions?accountId=${accountId}`,
          "GET",
          undefined,
          memberToken,
        )
      ).status,
    ).toBe(404);
    const shared = await request(
      `${root}/accounts/${accountId}/grants/${memberId}`,
      "PUT",
      { level: "TOTALS" },
      actorToken,
      { "If-Match": '"0"' },
    );
    expect(shared.ok).toBe(true);
    expect(
      (
        await request(
          `${root}/transactions?accountId=${accountId}`,
          "GET",
          undefined,
          memberToken,
        )
      ).status,
    ).toBe(404);
    expect(
      (await request(`${path}/rows`, "GET", undefined, memberToken)).status,
    ).toBe(404);
    expect(
      (
        await request(
          `${root}/accounts/${accountId}/grants/${memberId}`,
          "PUT",
          { level: "TRANSACTIONS" },
          actorToken,
          { "If-Match": '"1"' },
        )
      ).ok,
    ).toBe(true);
    const viewed = await ledger(accountId, memberToken);
    expect(viewed.find((row) => row.id === first.id)).toMatchObject({
      category: "Food",
      note: { body: null, version: 0 },
    });
    expect(JSON.stringify(viewed)).not.toContain("Owner private note");
    expect(
      (
        await request(
          `${root}/imports/preview`,
          "POST",
          csv,
          memberToken,
          uploadHeaders(),
        )
      ).status,
    ).toBe(404);
    expect((await request(path, "GET", undefined, memberToken)).status).toBe(
      404,
    );
    expect(
      (
        await request(`${path}/original`, "DELETE", undefined, actorToken, {
          "If-Match": `"${current.version}"`,
        })
      ).ok,
    ).toBe(true);
    expect((await batch(current.id)).originalAvailable).toBe(false);
  } finally {
    await fixture.close();
  }
}, 60000);

it("validates upload metadata/bounds, persists safe worker errors and revisions, and isolates author notes", async () => {
  const fixture = await createImportsHttpFixture();
  const {
    root,
    base,
    accountId,
    manualAccountId,
    actorToken,
    memberToken,
    memberId,
    request,
    batch,
    progress,
    ledger,
    uploadHeaders,
    maintenance,
  } = fixture;
  try {
    const inspectPath = `${root}/imports/inspect`;
    expect(
      (
        await request(
          inspectPath,
          "POST",
          "date,description,amount\n2026-01-01,A,-1",
          actorToken,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          `${root}/imports/preview`,
          "POST",
          "date,description,amount\n2026-01-01,A,-1",
          actorToken,
          { ...uploadHeaders(), "X-Import-Mapping": "%invalid" },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          inspectPath,
          "POST",
          "x".repeat(MAX_CSV_BYTES + 1),
          actorToken,
          { "X-Account-Id": accountId },
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await request(
          inspectPath,
          "POST",
          'date,description,amount\n"unterminated',
          actorToken,
          { "X-Account-Id": accountId },
        )
      ).status,
    ).toBe(400);
    const invalidEncoding = await fetch(`${base}/v1${inspectPath}`, {
      method: "POST",
      headers: {
        Authorization: `Session ${actorToken}`,
        "Content-Type": "text/csv",
        "X-Account-Id": accountId,
      },
      body: new Uint8Array([255, 254, 255]).buffer,
    });
    expect(invalidEncoding.status).toBe(400);
    const queued = await request(
      `${root}/imports/preview`,
      "POST",
      "date,description,amount\n2026-02-01,Unreadable fixture,-2\n",
      actorToken,
      uploadHeaders(),
    );
    expect(queued.ok).toBe(true);
    const failedId = importJobResultSchema.parse(await queued.json()).batch.id;
    await maintenance.importObject.update({
      where: { batchId: failedId },
      data: { ciphertext: "invalid-synthetic-ciphertext" },
    });
    await progress(failedId);
    const failed = await batch(failedId);
    expect(failed).toMatchObject({
      state: "FAILED",
      failureCode: "CSV_UNAVAILABLE",
      committedRows: 0,
    });
    expect(JSON.stringify(failed)).not.toContain(
      "invalid-synthetic-ciphertext",
    );
    const body = {
      accountId: manualAccountId,
      bookedDate: "2026-01-03",
      money: { amountMinor: "-250", currency: "GBP" },
      description: "Manual purchase",
    };
    const idempotency = randomUUID();
    const response = await request(
      `${root}/transactions`,
      "POST",
      body,
      actorToken,
      { "Idempotency-Key": idempotency },
    );
    expect(response.ok).toBe(true);
    let transaction = transactionSchema.parse(await response.json());
    const manualPath = `${root}/transactions/${transaction.id}`;
    const replay = await request(
      `${root}/transactions`,
      "POST",
      body,
      actorToken,
      { "Idempotency-Key": idempotency },
    );
    expect(transactionSchema.parse(await replay.json()).id).toBe(
      transaction.id,
    );
    expect(
      (
        await request(
          `${root}/transactions`,
          "POST",
          { ...body, description: "Changed request" },
          actorToken,
          { "Idempotency-Key": idempotency },
        )
      ).status,
    ).toBe(409);
    const corrected = await request(
      manualPath,
      "PATCH",
      {
        bookedDate: "2026-01-04",
        money: { amountMinor: "-300", currency: "GBP" },
        description: "Corrected purchase",
      },
      actorToken,
      { "If-Match": `"${transaction.version}"` },
    );
    expect(corrected.ok).toBe(true);
    transaction = transactionSchema.parse(await corrected.json());
    expect(transaction).toMatchObject({
      description: "Corrected purchase",
      money: { amountMinor: "-300" },
      version: 2,
    });
    expect(
      (
        await request(
          manualPath,
          "PATCH",
          {
            bookedDate: "2026-01-05",
            money: { amountMinor: "-400", currency: "GBP" },
            description: "Stale correction",
          },
          actorToken,
          { "If-Match": '"1"' },
        )
      ).status,
    ).toBe(409);
    expect(
      await maintenance.transactionRevision.count({
        where: { transactionId: transaction.id },
      }),
    ).toBe(2);
    const noted = await request(
      `${manualPath}/annotation`,
      "PATCH",
      { note: "First author only", noteVersion: 0 },
      actorToken,
      { "If-Match": `"${transaction.version}"` },
    );
    expect(noted.ok).toBe(true);
    transaction = transactionSchema.parse(await noted.json());
    expect(
      (
        await request(
          `${root}/accounts/${manualAccountId}/grants/${memberId}`,
          "PUT",
          { level: "TRANSACTIONS" },
          actorToken,
          { "If-Match": '"0"' },
        )
      ).ok,
    ).toBe(true);
    const memberView = (await ledger(manualAccountId, memberToken))[0];
    expect(memberView?.note).toEqual({ body: null, version: 0 });
    const memberNote = await request(
      `${manualPath}/annotation`,
      "PATCH",
      { note: "Second author only", noteVersion: 0 },
      memberToken,
      { "If-Match": `"${transaction.version}"` },
    );
    expect(memberNote.ok).toBe(true);
    expect((await ledger(manualAccountId))[0]?.note.body).toBe(
      "First author only",
    );
    expect((await ledger(manualAccountId, memberToken))[0]?.note.body).toBe(
      "Second author only",
    );
    const classified = await request(
      `${manualPath}/annotation`,
      "PATCH",
      { category: "Groceries" },
      actorToken,
      { "If-Match": `"${transaction.version}"` },
    );
    expect(classified.ok).toBe(true);
    transaction = transactionSchema.parse(await classified.json());
    const undone = await request(
      `${manualPath}/annotation`,
      "PATCH",
      { category: null },
      actorToken,
      { "If-Match": `"${transaction.version}"` },
    );
    expect(undone.ok).toBe(true);
    transaction = transactionSchema.parse(await undone.json());
    expect(transaction).toMatchObject({
      category: null,
      note: { body: "First author only" },
    });
    expect(
      await maintenance.transactionRevision.count({
        where: { transactionId: transaction.id },
      }),
    ).toBe(4);
    expect(
      (
        await request(
          `${manualPath}/annotation`,
          "PATCH",
          { category: "Admin override" },
          memberToken,
          { "If-Match": `"${transaction.version}"` },
        )
      ).status,
    ).toBe(404);
  } finally {
    await fixture.close();
  }
}, 60000);

it("persists unsupported CSV cells as row rejects and rejects invalid manual input at HTTP boundaries", async () => {
  const fixture = await createImportsHttpFixture();
  const { root, actorToken, manualAccountId, request, preview } = fixture;
  try {
    const result = await preview(
      "date,description,amount\n0000-01-01,Old row,-1.00\n2026-01-01,Bad\u0000cell,-1.00\n2026-01-01,Valid family 💚,-1.00",
    );
    expect(result).toMatchObject({
      state: "READY",
      validRows: 1,
      rejectedRows: 2,
    });
    const response = await request(`${root}/imports/${result.id}/rows`);
    expect(response.status).toBe(200);
    expect(importRowsSchema.parse(await response.json()).items).toMatchObject([
      { status: "REJECTED", reason: "INVALID_DATE" },
      { status: "REJECTED", reason: "INVALID_DESCRIPTION" },
      { status: "VALID", description: "Valid family 💚" },
    ]);
    const valid = {
      accountId: manualAccountId,
      bookedDate: "2026-01-01",
      money: { amountMinor: "-100", currency: "GBP" },
      description: "Synthetic",
    };
    for (const input of [
      { ...valid, bookedDate: "0000-01-01" },
      { ...valid, description: "Bad\u0000cell" },
      { ...valid, description: "Bad\ud800cell" },
    ]) {
      const invalid = await request(
        `${root}/transactions`,
        "POST",
        input,
        actorToken,
        { "Idempotency-Key": randomUUID() },
      );
      expect(invalid.status).toBe(400);
      expect(JSON.stringify(await invalid.json())).not.toContain("Bad");
    }
  } finally {
    await fixture.close();
  }
}, 30000);
