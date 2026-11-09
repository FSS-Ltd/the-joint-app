import { describe, it, expect, vi } from "vitest";
import type {
  DeviceDto,
  DeviceAccountGrantDto,
  InsightJobDto,
  StartPairingResponse,
} from "../packages/contracts/src/index.js";
import { createDevicesApi } from "../apps/mobile/src/api/devices.js";
import type { NativeTransport } from "../apps/mobile/src/api/types.js";

describe("Native Companion UI & API Client (IOS13c)", () => {
  const mockHouseholdId = "11111111-1111-4111-8111-111111111111";
  const mockDeviceId = "22222222-2222-4222-8222-222222222222";
  const mockUserId = "33333333-3333-4333-8333-333333333333";
  const mockAccountId = "44444444-4444-4444-8444-444444444444";
  const mockGrantId = "55555555-5555-4555-8555-555555555555";
  const mockJobId = "66666666-6666-4666-8666-666666666666";

  it("lists companion devices for household", async () => {
    const mockDevices: DeviceDto[] = [
      {
        id: mockDeviceId,
        householdId: mockHouseholdId,
        name: "MacBook Air",
        fingerprint: "a".repeat(64),
        publicKey: "pk",
        keyVersion: 1,
        status: "APPROVED",
        pairedByUserId: mockUserId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
    ];

    const mockTransport: NativeTransport = {
      request: vi.fn().mockResolvedValue(mockDevices),
    } as unknown as NativeTransport;

    const api = createDevicesApi(mockTransport);
    const result = await api.listDevices(mockHouseholdId);

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("MacBook Air");
    expect(result[0]!.status).toBe("APPROVED");
    expect(mockTransport.request).toHaveBeenCalledWith(
      `v1/households/${mockHouseholdId}/devices`,
      expect.anything(),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("starts pairing and returns 6-digit numeric pairing code", async () => {
    const mockResponse: StartPairingResponse = {
      pairingCode: "847291",
      fingerprint: "b".repeat(64),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    };

    const mockTransport: NativeTransport = {
      request: vi.fn().mockResolvedValue(mockResponse),
    } as unknown as NativeTransport;

    const api = createDevicesApi(mockTransport);
    const res = await api.startPairing(mockHouseholdId, "MacBook Pro");

    expect(res.pairingCode).toBe("847291");
    expect(res.pairingCode).toHaveLength(6);
    expect(mockTransport.request).toHaveBeenCalledWith(
      `v1/households/${mockHouseholdId}/devices/pairing`,
      expect.anything(),
      expect.objectContaining({
        method: "POST",
        body: { name: "MacBook Pro" },
      }),
    );
  });

  it("approves pending device with fingerprint verification", async () => {
    const mockApproved: DeviceDto = {
      id: mockDeviceId,
      householdId: mockHouseholdId,
      name: "Mac Studio",
      fingerprint: "c".repeat(64),
      publicKey: "pk",
      keyVersion: 1,
      status: "APPROVED",
      pairedByUserId: "33333333-3333-3333-3333-333333333333",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };

    const mockTransport: NativeTransport = {
      request: vi.fn().mockResolvedValue(mockApproved),
    } as unknown as NativeTransport;

    const api = createDevicesApi(mockTransport);
    const res = await api.approveDevice(
      mockHouseholdId,
      mockDeviceId,
      "c".repeat(64),
    );

    expect(res.status).toBe("APPROVED");
    expect(mockTransport.request).toHaveBeenCalledWith(
      `v1/households/${mockHouseholdId}/devices/${mockDeviceId}/approve`,
      expect.anything(),
      expect.objectContaining({
        method: "POST",
        body: { fingerprint: "c".repeat(64) },
      }),
    );
  });

  it("fetches and updates account consent grants", async () => {
    const mockGrants: DeviceAccountGrantDto[] = [
      {
        id: mockGrantId,
        deviceId: mockDeviceId,
        accountId: mockAccountId,
        ownerUserId: mockUserId,
        permission: "TRANSACTIONS",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const mockTransport: NativeTransport = {
      request: vi
        .fn()
        .mockResolvedValueOnce(mockGrants)
        .mockResolvedValueOnce([{ ...mockGrants[0]!, permission: "TOTALS" }]),
    } as unknown as NativeTransport;

    const api = createDevicesApi(mockTransport);
    const current = await api.getAccountGrants(mockHouseholdId, mockDeviceId);
    expect(current[0]!.permission).toBe("TRANSACTIONS");

    const updated = await api.updateAccountGrants(
      mockHouseholdId,
      mockDeviceId,
      [{ accountId: mockAccountId, permission: "TOTALS" }],
    );
    expect(updated[0]!.permission).toBe("TOTALS");
    expect(mockTransport.request).toHaveBeenLastCalledWith(
      `v1/households/${mockHouseholdId}/devices/${mockDeviceId}/account-grants`,
      expect.anything(),
      expect.objectContaining({
        method: "PUT",
        body: { grants: [{ accountId: mockAccountId, permission: "TOTALS" }] },
      }),
    );
  });

  it("revokes device authorization immediately", async () => {
    const mockTransport: NativeTransport = {
      request: vi.fn().mockResolvedValue(undefined),
    } as unknown as NativeTransport;

    const api = createDevicesApi(mockTransport);
    await api.revokeDevice(mockHouseholdId, mockDeviceId);

    expect(mockTransport.request).toHaveBeenCalledWith(
      `v1/households/${mockHouseholdId}/devices/${mockDeviceId}`,
      expect.anything(),
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("creates and inspects background insight jobs", async () => {
    const mockJob: InsightJobDto = {
      id: mockJobId,
      householdId: mockHouseholdId,
      requesterUserId: mockUserId,
      audienceScope: "HOUSEHOLD",
      status: "QUEUED",
      featureType: "SPEND_SUMMARY",
      parameters: {},
      assignedDeviceId: null,
      leaseExpiresAt: null,
      attempts: 0,
      maxAttempts: 3,
      resultPayload: null,
      grantVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };

    const mockCompletedJob: InsightJobDto = {
      ...mockJob,
      status: "VALIDATED",
      resultPayload: {
        summary: "Monthly groceries spend is £240.00 across 4 transactions.",
        toolRounds: 1,
      },
    };

    const mockTransport: NativeTransport = {
      request: vi
        .fn()
        .mockResolvedValueOnce(mockJob)
        .mockResolvedValueOnce([mockCompletedJob])
        .mockResolvedValueOnce(mockCompletedJob),
    } as unknown as NativeTransport;

    const api = createDevicesApi(mockTransport);
    const created = await api.createInsightJob(mockHouseholdId, {
      featureType: "SPEND_SUMMARY",
      audienceScope: "HOUSEHOLD",
      parameters: {},
    });
    expect(created.status).toBe("QUEUED");

    const list = await api.listInsightJobs(mockHouseholdId);
    expect(list).toHaveLength(1);
    expect(list[0]!.status).toBe("VALIDATED");

    const fetched = await api.getInsightJob(mockHouseholdId, mockJob.id);
    expect(fetched.resultPayload).toBeDefined();
    expect(
      (fetched.resultPayload as Record<string, unknown>).summary,
    ).toContain("groceries");
  });
});
