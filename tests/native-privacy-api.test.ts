/**
 * IOS7a — Native privacy, archive, and CSV download transport & API unit tests.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createNativeTransport,
  createPrivacyApi,
  NativeApiError,
} from "./fixtures/native-api.js";
import { nativeErrorMessage } from "../apps/mobile/src/api/errors.js";

const apiUrl = "https://api.example.test";
const householdId = "00000000-0000-4000-8000-000000000001";
const accountId = "00000000-0000-4000-8000-000000000002";
const exportId = "00000000-0000-4000-8000-000000000003";
const requestId = "00000000-0000-4000-8000-000000000004";
const validStatusToken = "A".repeat(43);

describe("createPrivacyApi & NativeTransport privacy extensions", () => {
  it("requests, polls, and downloads household and archive CSV exports", async () => {
    const csvText = "date,description,amount\n2026-10-01,Coffee,-350\n";
    const send = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/download")) {
        return new Response(new TextEncoder().encode(csvText), {
          status: 200,
          headers: { "content-type": "text/csv; charset=utf-8" },
        });
      }
      return Response.json({
        id: exportId,
        state: "READY",
        createdAt: "2026-10-20T10:00:00.000Z",
        expiresAt: "2026-10-21T10:00:00.000Z",
        downloadExpiresAt: "2026-10-20T10:15:00.000Z",
      });
    });
    const transport = createNativeTransport(
      apiUrl,
      async () => "bearer-token",
      send,
    );
    const privacy = createPrivacyApi(transport);
    const signal = new AbortController().signal;

    const job = await privacy.requestExport(householdId, [accountId], signal);
    expect(job.id).toBe(exportId);
    expect(send).toHaveBeenNthCalledWith(
      1,
      `${apiUrl}/v1/households/${householdId}/exports`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ accountIds: [accountId] }),
        headers: expect.objectContaining({
          Authorization: "Bearer bearer-token",
        }),
      }),
    );

    const status = await privacy.readExportStatus(
      householdId,
      exportId,
      signal,
    );
    expect(status.state).toBe("READY");

    const bytes = await privacy.downloadExport(householdId, exportId, signal);
    expect(new TextDecoder().decode(bytes)).toBe(csvText);

    const archiveJob = await privacy.requestArchiveExport([accountId], signal);
    expect(archiveJob.id).toBe(exportId);

    const archiveStatus = await privacy.readArchiveExportStatus(
      exportId,
      signal,
    );
    expect(archiveStatus.id).toBe(exportId);

    const archiveBytes = await privacy.downloadArchiveExport(exportId, signal);
    expect(new TextDecoder().decode(archiveBytes)).toBe(csvText);
  });

  it("rejects downloadCsv on non-download paths, non-CSV content types, empty bodies, invalid UTF-8, and >10 MiB payloads", async () => {
    const token = vi.fn(async () => "bearer-token");
    const signal = new AbortController().signal;

    // 1. Non-download path rejected before token acquisition
    const transport1 = createNativeTransport(apiUrl, token, vi.fn());
    await expect(
      transport1.downloadCsv!(`households/${householdId}/accounts`, signal),
    ).rejects.toBeInstanceOf(NativeApiError);
    expect(token).not.toHaveBeenCalled();

    // 2. Wrong content-type rejected
    const transport2 = createNativeTransport(
      apiUrl,
      token,
      async () =>
        new Response("not csv", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(
      transport2.downloadCsv!(
        `households/${householdId}/exports/${exportId}/download`,
        signal,
      ),
    ).rejects.toBeInstanceOf(NativeApiError);

    // 3. Empty body rejected
    const transport3 = createNativeTransport(
      apiUrl,
      token,
      async () =>
        new Response(new Uint8Array(0), {
          status: 200,
          headers: { "content-type": "text/csv" },
        }),
    );
    await expect(
      transport3.downloadCsv!(
        `households/${householdId}/exports/${exportId}/download`,
        signal,
      ),
    ).rejects.toBeInstanceOf(NativeApiError);

    // 4. Invalid UTF-8 rejected
    const transport4 = createNativeTransport(
      apiUrl,
      token,
      async () =>
        new Response(new Uint8Array([0xff, 0xfe, 0xfd]), {
          status: 200,
          headers: { "content-type": "text/csv" },
        }),
    );
    await expect(
      transport4.downloadCsv!(
        `households/${householdId}/exports/${exportId}/download`,
        signal,
      ),
    ).rejects.toBeInstanceOf(NativeApiError);

    // 5. >10 MiB payload rejected and stream cancelled
    const cancel = vi.fn();
    const oversized = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1));
      },
      cancel,
    });
    const transport5 = createNativeTransport(
      apiUrl,
      token,
      async () =>
        new Response(oversized, {
          status: 200,
          headers: { "content-type": "text/csv" },
        }),
    );
    await expect(
      transport5.downloadCsv!(
        `households/${householdId}/exports/${exportId}/download`,
        signal,
      ),
    ).rejects.toBeInstanceOf(NativeApiError);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("extracts structured error codes from non-2xx downloadCsv responses", async () => {
    const transport = createNativeTransport(
      apiUrl,
      async () => "bearer-token",
      async () =>
        Response.json(
          { error: { code: "MFA_REAUTH_REQUIRED", message: "reauth" } },
          { status: 403 },
        ),
    );
    try {
      await transport.downloadCsv!(
        `households/${householdId}/exports/${exportId}/download`,
        new AbortController().signal,
      );
      expect.unreachable("should have thrown");
    } catch (cause) {
      expect(cause).toBeInstanceOf(NativeApiError);
      expect((cause as NativeApiError).status).toBe(403);
      expect((cause as NativeApiError).code).toBe("MFA_REAUTH_REQUIRED");
      expect(nativeErrorMessage(cause)).toBe(
        "Verify a fresh authenticator code in Account security, then try again.",
      );
    }
  });

  it("enforces deletion-receipt authorization strictly on deletion status and stream endpoints without calling getToken", async () => {
    const getToken = vi.fn(async () => "should-not-be-used");
    const send = vi.fn<typeof fetch>(async () =>
      Response.json({
        id: requestId,
        state: "PROVIDER_PENDING",
        requestedAt: "2026-10-20T10:00:00.000Z",
        completedAt: null,
      }),
    );
    const transport = createNativeTransport(apiUrl, getToken, send);
    const privacy = createPrivacyApi(transport);
    const signal = new AbortController().signal;

    const status = await privacy.readDeletionStatus(
      requestId,
      validStatusToken,
      signal,
    );
    expect(status.state).toBe("PROVIDER_PENDING");
    expect(getToken).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      `${apiUrl}/v1/privacy/deletion-requests/${requestId}`,
      expect.objectContaining({
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Deletion ${validStatusToken}`,
        },
      }),
    );

    // Rejects invalid statusToken format before network call
    await expect(
      privacy.readDeletionStatus(requestId, "short-token", signal),
    ).rejects.toBeInstanceOf(NativeApiError);

    // Rejects deletion-receipt authorization on non-deletion paths
    await expect(
      transport.request("me", {} as never, {
        method: "GET",
        signal,
        authorization: { kind: "deletion-receipt", token: validStatusToken },
      }),
    ).rejects.toBeInstanceOf(NativeApiError);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("handles leaveHousehold, requestDeletion, readEntitlements, and owner archive reads", async () => {
    const send = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/memberships/me")) {
        expect(init?.method).toBe("DELETE");
        return Response.json({
          left: true,
        });
      }
      if (url.endsWith("/privacy/deletion-requests")) {
        expect(init?.method).toBe("POST");
        return Response.json({
          id: requestId,
          state: "PENDING",
          statusToken: validStatusToken,
          expiresAt: "2026-10-27T10:00:00.000Z",
        });
      }
      if (url.endsWith("/entitlements")) {
        return Response.json({
          plan: "FREE",
          version: "a".repeat(64),
          capabilities: ["finance.manual", "projections.basic"],
          caps: {
            bankAuthorisations: 0,
            brokerConnections: 0,
            companionDevices: 0,
          },
          effectiveUntil: null,
        });
      }
      if (url.includes(`/me/archive/accounts/${accountId}/transactions`)) {
        return Response.json({
          items: [
            {
              id: exportId,
              accountId,
              bookedDate: "2026-10-01",
              money: { amountMinor: "250000", currency: "GBP" },
              description: "Salary",
              source: "MANUAL",
              version: 1,
              createdAt: "2026-10-01T10:00:00.000Z",
              category: "Salary",
              classificationKind: "INCOME",
              effectiveKind: "INCOME",
              classificationConfirmed: true,
              splits: [],
              transfer: null,
              merchant: null,
              note: { body: "Private note", version: 1 },
              permissions: {
                canCorrect: false,
                canClassify: false,
                canNote: false,
              },
            },
          ],
          nextCursor: null,
        });
      }
      if (url.endsWith(`/me/archive/accounts/${accountId}`)) {
        return Response.json({
          id: accountId,
          householdId,
          label: "Archived Savings",
          kind: "SAVINGS",
          currency: "GBP",
          legalOwnerKind: "ADULT",
          liquidity: "AVAILABLE",
          version: 1,
          source: "MANUAL",
          ownership: "OWNED",
          access: "TRANSACTIONS",
          latestValuation: {
            id: exportId,
            money: { amountMinor: "100000", currency: "GBP" },
            asOfDate: "2026-10-01",
            recordedAt: "2026-10-01T10:00:00.000Z",
            complete: true,
            source: "MANUAL",
            adultMoney: null,
          },
          sharing: null,
          permissions: { canEdit: false, canValue: false, canShare: false },
        });
      }
      return Response.json({
        items: [
          {
            id: accountId,
            householdId,
            label: "Archived Savings",
            kind: "SAVINGS",
            currency: "GBP",
            legalOwnerKind: "ADULT",
            liquidity: "AVAILABLE",
            version: 1,
            source: "MANUAL",
            ownership: "OWNED",
            access: "TRANSACTIONS",
            latestValuation: null,
            sharing: null,
            permissions: { canEdit: false, canValue: false, canShare: false },
          },
        ],
        nextCursor: null,
      });
    });

    const transport = createNativeTransport(
      apiUrl,
      async () => "bearer-token",
      send,
    );
    const privacy = createPrivacyApi(transport);
    const signal = new AbortController().signal;

    const entitlements = await privacy.readEntitlements(householdId, signal);
    expect(entitlements.plan).toBe("FREE");

    const archiveList = await privacy.listArchiveAccounts(
      { limit: 25 },
      signal,
    );
    expect(archiveList.items).toHaveLength(1);
    expect(archiveList.items[0]?.permissions.canEdit).toBe(false);

    const archiveAcc = await privacy.readArchiveAccount(accountId, signal);
    expect(archiveAcc.label).toBe("Archived Savings");

    const archiveTxs = await privacy.listArchiveTransactions(
      accountId,
      { limit: 25 },
      signal,
    );
    expect(archiveTxs.items[0]?.note.body).toBe("Private note");

    const left = await privacy.leaveHousehold(householdId, requestId, signal);
    expect(left.left).toBe(true);

    const receipt = await privacy.requestDeletion(requestId, signal);
    expect(receipt.statusToken).toBe(validStatusToken);
  });
});
