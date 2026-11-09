import { z } from "zod";

export const deviceStatusSchema = z.enum(["PENDING", "APPROVED", "REVOKED"]);
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;

export const deviceAccountPermissionSchema = z.enum([
  "NONE",
  "TOTALS",
  "TRANSACTIONS",
]);
export type DeviceAccountPermission = z.infer<
  typeof deviceAccountPermissionSchema
>;

export const insightJobStatusSchema = z.enum([
  "QUEUED",
  "LEASED",
  "RUNNING",
  "VALIDATED",
  "AVAILABLE",
  "EXPIRED",
  "CANCELLED",
  "FAILED",
  "REVOKED",
]);
export type InsightJobStatus = z.infer<typeof insightJobStatusSchema>;

export const insightFeatureTypeSchema = z.enum([
  "SPEND_SUMMARY",
  "RECURRING_COSTS",
  "GOAL_PROJECTION",
  "GOAL_COMPARISON",
]);
export type InsightFeatureType = z.infer<typeof insightFeatureTypeSchema>;

export const audienceScopeSchema = z.enum(["PERSONAL", "HOUSEHOLD"]);
export type AudienceScope = z.infer<typeof audienceScopeSchema>;

export const deviceDtoSchema = z
  .object({
    id: z.string().uuid(),
    householdId: z.string().uuid(),
    name: z.string().min(1).max(100),
    fingerprint: z.string().min(16).max(128),
    publicKey: z.string().min(32),
    keyVersion: z.number().int().min(1),
    status: deviceStatusSchema,
    pairedByUserId: z.string().uuid(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    lastSeenAt: z.string().datetime().nullable(),
  })
  .strict();
export type DeviceDto = z.infer<typeof deviceDtoSchema>;

export const startPairingRequestSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
  })
  .strict();
export type StartPairingRequest = z.infer<typeof startPairingRequestSchema>;

export const startPairingResponseSchema = z
  .object({
    pairingCode: z.string().min(6).max(12),
    fingerprint: z.string().min(16).max(128),
    expiresAt: z.string().datetime(),
  })
  .strict();
export type StartPairingResponse = z.infer<typeof startPairingResponseSchema>;

export const approveDeviceRequestSchema = z
  .object({
    fingerprint: z.string().min(16).max(128),
  })
  .strict();
export type ApproveDeviceRequest = z.infer<typeof approveDeviceRequestSchema>;

export const completePairingRequestSchema = z
  .object({
    pairingCode: z.string().min(6).max(12),
    name: z.string().min(1).max(100),
    publicKey: z.string().min(32),
    proofOfPossession: z.string().min(32),
  })
  .strict();
export type CompletePairingRequest = z.infer<
  typeof completePairingRequestSchema
>;

export const completePairingResponseSchema = z
  .object({
    deviceId: z.string().uuid(),
    householdId: z.string().uuid(),
    fingerprint: z.string().min(16).max(128),
    status: deviceStatusSchema,
  })
  .strict();
export type CompletePairingResponse = z.infer<
  typeof completePairingResponseSchema
>;

export const sessionChallengeRequestSchema = z
  .object({
    deviceId: z.string().uuid(),
  })
  .strict();
export type SessionChallengeRequest = z.infer<
  typeof sessionChallengeRequestSchema
>;

export const sessionChallengeResponseSchema = z
  .object({
    nonce: z.string().min(32).max(128),
    expiresAt: z.string().datetime(),
  })
  .strict();
export type SessionChallengeResponse = z.infer<
  typeof sessionChallengeResponseSchema
>;

export const deviceSessionRequestSchema = z
  .object({
    deviceId: z.string().uuid(),
    nonce: z.string().min(32).max(128),
    signature: z.string().min(32),
  })
  .strict();
export type DeviceSessionRequest = z.infer<typeof deviceSessionRequestSchema>;

export const deviceSessionResponseSchema = z
  .object({
    sessionToken: z.string().min(32),
    deviceId: z.string().uuid(),
    householdId: z.string().uuid(),
    expiresAt: z.string().datetime(),
  })
  .strict();
export type DeviceSessionResponse = z.infer<typeof deviceSessionResponseSchema>;

export const deviceAccountGrantItemSchema = z
  .object({
    accountId: z.string().uuid(),
    permission: deviceAccountPermissionSchema,
  })
  .strict();
export type DeviceAccountGrantItem = z.infer<
  typeof deviceAccountGrantItemSchema
>;

export const updateDeviceAccountGrantsRequestSchema = z
  .object({
    grants: z.array(deviceAccountGrantItemSchema),
  })
  .strict();
export type UpdateDeviceAccountGrantsRequest = z.infer<
  typeof updateDeviceAccountGrantsRequestSchema
>;

export const deviceAccountGrantDtoSchema = z
  .object({
    id: z.string().uuid(),
    deviceId: z.string().uuid(),
    accountId: z.string().uuid(),
    ownerUserId: z.string().uuid(),
    permission: deviceAccountPermissionSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type DeviceAccountGrantDto = z.infer<typeof deviceAccountGrantDtoSchema>;

export const createInsightJobRequestSchema = z
  .object({
    audienceScope: audienceScopeSchema.default("HOUSEHOLD"),
    featureType: insightFeatureTypeSchema,
    parameters: z.record(z.string(), z.unknown()).default({}),
    promptText: z.string().max(1000).optional(),
  })
  .strict();
export type CreateInsightJobRequest = z.infer<
  typeof createInsightJobRequestSchema
>;

export const insightJobDtoSchema = z
  .object({
    id: z.string().uuid(),
    householdId: z.string().uuid(),
    requesterUserId: z.string().uuid(),
    audienceScope: audienceScopeSchema,
    status: insightJobStatusSchema,
    featureType: insightFeatureTypeSchema,
    parameters: z.record(z.string(), z.unknown()),
    assignedDeviceId: z.string().uuid().nullable(),
    leaseExpiresAt: z.string().datetime().nullable(),
    attempts: z.number().int(),
    maxAttempts: z.number().int(),
    resultPayload: z.record(z.string(), z.unknown()).nullable(),
    grantVersion: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict();
export type InsightJobDto = z.infer<typeof insightJobDtoSchema>;

export const companionClaimRequestSchema = z
  .object({
    deviceId: z.string().uuid(),
    maxBatchSize: z.number().int().min(1).max(5).default(1),
  })
  .strict();
export type CompanionClaimRequest = z.infer<typeof companionClaimRequestSchema>;

export const companionClaimResponseSchema = z
  .object({
    claimedJob: insightJobDtoSchema.nullable(),
    leaseToken: z.string().uuid().nullable(),
    leaseExpiresAt: z.string().datetime().nullable(),
  })
  .strict();
export type CompanionClaimResponse = z.infer<
  typeof companionClaimResponseSchema
>;

export const companionEvidenceResponseSchema = z
  .object({
    jobId: z.string().uuid(),
    deviceId: z.string().uuid(),
    audienceScope: audienceScopeSchema,
    grantVersion: z.number().int(),
    envelopeCiphertext: z.string(),
    envelopeIv: z.string(),
    envelopeTag: z.string(),
    evidenceHash: z.string(),
    expiresAt: z.string().datetime(),
  })
  .strict();
export type CompanionEvidenceResponse = z.infer<
  typeof companionEvidenceResponseSchema
>;

export const companionPermitRequestSchema = z
  .object({
    leaseToken: z.string().uuid(),
  })
  .strict();
export type CompanionPermitRequest = z.infer<
  typeof companionPermitRequestSchema
>;

export const companionPermitResponseSchema = z
  .object({
    permitted: z.boolean(),
    reason: z.string().optional(),
    currentGrantVersion: z.number().int(),
  })
  .strict();
export type CompanionPermitResponse = z.infer<
  typeof companionPermitResponseSchema
>;

export const companionRenewRequestSchema = z
  .object({
    leaseToken: z.string().uuid(),
  })
  .strict();
export type CompanionRenewRequest = z.infer<typeof companionRenewRequestSchema>;

export const companionRenewResponseSchema = z
  .object({
    renewed: z.boolean(),
    leaseExpiresAt: z.string().datetime(),
    renewalsRemaining: z.number().int(),
  })
  .strict();
export type CompanionRenewResponse = z.infer<
  typeof companionRenewResponseSchema
>;

export const companionCompleteRequestSchema = z
  .object({
    leaseToken: z.string().uuid(),
    evidenceHash: z.string(),
    grantVersion: z.number().int(),
    resultPayload: z.record(z.string(), z.unknown()),
    signature: z.string().min(32),
  })
  .strict();
export type CompanionCompleteRequest = z.infer<
  typeof companionCompleteRequestSchema
>;

export const companionCompleteResponseSchema = z
  .object({
    accepted: z.boolean(),
    jobId: z.string().uuid(),
    status: insightJobStatusSchema,
  })
  .strict();
export type CompanionCompleteResponse = z.infer<
  typeof companionCompleteResponseSchema
>;
