import {
  deviceDtoSchema,
  startPairingRequestSchema,
  startPairingResponseSchema,
  createInsightJobRequestSchema,
  insightJobDtoSchema,
  deviceListSchema,
  deviceAccountGrantsListSchema,
  insightJobListSchema,
  emptyResponseSchema,
  idempotencyKeySchema,
  type DeviceDto,
  type StartPairingResponse,
  type DeviceAccountGrantDto,
  type InsightJobDto,
  type CreateInsightJobRequest,
  type DeviceAccountGrantItem,
  type DeviceAccountPermission,
} from "@joint/contracts";

export type { DeviceAccountPermission };
import type { NativeTransport } from "./types.js";

export function createDevicesApi(transport: NativeTransport) {
  return {
    listDevices(
      householdId: string,
      signal?: AbortSignal,
    ): Promise<DeviceDto[]> {
      const cleanHouseholdId = idempotencyKeySchema.parse(householdId);
      return transport.request(
        `households/${cleanHouseholdId}/devices`,
        deviceListSchema,
        {
          method: "GET",
          signal: signal ?? new AbortController().signal,
        },
      );
    },

    startPairing(
      householdId: string,
      name?: string,
      signal?: AbortSignal,
    ): Promise<StartPairingResponse> {
      const cleanHouseholdId = idempotencyKeySchema.parse(householdId);
      const body = startPairingRequestSchema.parse(
        name !== undefined ? { name } : {},
      );
      return transport.request(
        `households/${cleanHouseholdId}/devices/pairing`,
        startPairingResponseSchema,
        {
          method: "POST",
          body,
          signal: signal ?? new AbortController().signal,
        },
      );
    },

    approveDevice(
      householdId: string,
      deviceId: string,
      fingerprint: string,
      signal?: AbortSignal,
    ): Promise<DeviceDto> {
      const cleanHouseholdId = idempotencyKeySchema.parse(householdId);
      const cleanDeviceId = idempotencyKeySchema.parse(deviceId);
      return transport.request(
        `households/${cleanHouseholdId}/devices/${cleanDeviceId}/approve`,
        deviceDtoSchema,
        {
          method: "POST",
          body: { fingerprint },
          signal: signal ?? new AbortController().signal,
        },
      );
    },

    getAccountGrants(
      householdId: string,
      deviceId: string,
      signal?: AbortSignal,
    ): Promise<DeviceAccountGrantDto[]> {
      const cleanHouseholdId = idempotencyKeySchema.parse(householdId);
      const cleanDeviceId = idempotencyKeySchema.parse(deviceId);
      return transport.request(
        `households/${cleanHouseholdId}/devices/${cleanDeviceId}/account-grants`,
        deviceAccountGrantsListSchema,
        {
          method: "GET",
          signal: signal ?? new AbortController().signal,
        },
      );
    },

    updateAccountGrants(
      householdId: string,
      deviceId: string,
      grants: DeviceAccountGrantItem[],
      signal?: AbortSignal,
    ): Promise<DeviceAccountGrantDto[]> {
      const cleanHouseholdId = idempotencyKeySchema.parse(householdId);
      const cleanDeviceId = idempotencyKeySchema.parse(deviceId);
      return transport.request(
        `households/${cleanHouseholdId}/devices/${cleanDeviceId}/account-grants`,
        deviceAccountGrantsListSchema,
        {
          method: "PUT",
          body: { grants },
          signal: signal ?? new AbortController().signal,
        },
      );
    },

    revokeDevice(
      householdId: string,
      deviceId: string,
      signal?: AbortSignal,
    ): Promise<void> {
      const cleanHouseholdId = idempotencyKeySchema.parse(householdId);
      const cleanDeviceId = idempotencyKeySchema.parse(deviceId);
      return transport.request(
        `households/${cleanHouseholdId}/devices/${cleanDeviceId}`,
        emptyResponseSchema,
        {
          method: "DELETE",
          signal: signal ?? new AbortController().signal,
        },
      );
    },

    listInsightJobs(
      householdId: string,
      signal?: AbortSignal,
    ): Promise<InsightJobDto[]> {
      const cleanHouseholdId = idempotencyKeySchema.parse(householdId);
      return transport.request(
        `households/${cleanHouseholdId}/insights/jobs`,
        insightJobListSchema,
        {
          method: "GET",
          signal: signal ?? new AbortController().signal,
        },
      );
    },

    createInsightJob(
      householdId: string,
      input: CreateInsightJobRequest,
      signal?: AbortSignal,
    ): Promise<InsightJobDto> {
      const cleanHouseholdId = idempotencyKeySchema.parse(householdId);
      const body = createInsightJobRequestSchema.parse(input);
      return transport.request(
        `households/${cleanHouseholdId}/insights/jobs`,
        insightJobDtoSchema,
        {
          method: "POST",
          body,
          signal: signal ?? new AbortController().signal,
        },
      );
    },

    getInsightJob(
      householdId: string,
      jobId: string,
      signal?: AbortSignal,
    ): Promise<InsightJobDto> {
      const cleanHouseholdId = idempotencyKeySchema.parse(householdId);
      const cleanJobId = idempotencyKeySchema.parse(jobId);
      return transport.request(
        `households/${cleanHouseholdId}/insights/jobs/${cleanJobId}`,
        insightJobDtoSchema,
        {
          method: "GET",
          signal: signal ?? new AbortController().signal,
        },
      );
    },
  };
}

export type DevicesApi = ReturnType<typeof createDevicesApi>;
