import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@joint/database/client";
import type {
  AuthContext,
  CompanionClaimRequest,
  CompanionClaimResponse,
  CompanionCompleteRequest,
  CompanionCompleteResponse,
  CompanionEvidenceResponse,
  CompanionPermitRequest,
  CompanionPermitResponse,
  CompanionRenewRequest,
  CompanionRenewResponse,
  CreateInsightJobRequest,
  InsightJobDto,
} from "@joint/contracts";
import type { EntitlementService } from "../entitlements/entitlement.service.js";
import type { AuthenticatedDeviceContext } from "./device-auth.service.js";
import {
  encryptEvidenceEnvelope,
  getCompanionEnvelopeKey,
  verifyDeviceSignature,
} from "./device-crypto.js";

interface JobDbRow {
  id: string;
  householdId: string;
  requesterUserId: string;
  audienceScope: string;
  status: string;
  featureType: string;
  parameters: unknown;
  assignedDeviceId: string | null;
  leaseExpiresAt: Date | null;
  attempts: number;
  maxAttempts: number;
  resultPayload: unknown;
  grantVersion: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

interface PermittedDeviceGrant {
  accountId: string;
  permission: "NONE" | "TOTALS" | "TRANSACTIONS";
  ownerUserId: string;
  account: {
    currency: string;
    label: string;
    balances: { amountMinor: bigint; asOfDate: Date }[];
    transactions: {
      id: string;
      amountMinor: bigint;
      description: string;
      bookedDate: Date;
    }[];
  };
}

@Injectable()
export class InsightJobsService {
  private readonly envelopeKey: Buffer;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly entitlements: EntitlementService,
    envelopeKey?: Buffer,
  ) {
    this.envelopeKey = envelopeKey || getCompanionEnvelopeKey();
  }

  async createJob(
    context: AuthContext,
    request: CreateInsightJobRequest,
  ): Promise<InsightJobDto> {
    const entitlement = await this.entitlements.read(context);
    if (!entitlement.capabilities.includes("insights.local")) {
      throw new ForbiddenException(
        "Household plan does not include companion AI insights.",
      );
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const promptEnvelope = request.promptText
      ? encryptEvidenceEnvelope(
          { text: request.promptText },
          `${context.householdId}:${context.userId}`,
          this.envelopeKey,
        )
      : null;

    const job = await this.prisma.insightJob.create({
      data: {
        householdId: context.householdId,
        requesterUserId: context.userId,
        audienceScope: request.audienceScope,
        featureType: request.featureType,
        parameters: request.parameters as Prisma.InputJsonValue,
        promptCiphertext: promptEnvelope
          ? JSON.stringify(promptEnvelope)
          : null,
        expiresAt,
        status: "QUEUED",
      },
    });

    return this.mapJobDto(job);
  }

  async listJobs(context: AuthContext): Promise<InsightJobDto[]> {
    const jobs = await this.prisma.insightJob.findMany({
      where: {
        householdId: context.householdId,
        OR: [
          { audienceScope: "HOUSEHOLD" },
          { requesterUserId: context.userId },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return jobs.map((j: JobDbRow) => this.mapJobDto(j));
  }

  async getJob(context: AuthContext, jobId: string): Promise<InsightJobDto> {
    const job = await this.prisma.insightJob.findFirst({
      where: { id: jobId, householdId: context.householdId },
    });

    if (!job) throw new NotFoundException("Insight job not found.");

    if (
      job.audienceScope === "PERSONAL" &&
      job.requesterUserId !== context.userId
    ) {
      throw new ForbiddenException(
        "Cannot view another adult's personal insight.",
      );
    }

    return this.mapJobDto(job);
  }

  async cancelJob(context: AuthContext, jobId: string): Promise<InsightJobDto> {
    const job = await this.prisma.insightJob.findFirst({
      where: { id: jobId, householdId: context.householdId },
    });

    if (!job) throw new NotFoundException("Insight job not found.");
    if (job.requesterUserId !== context.userId) {
      throw new ForbiddenException(
        "Only the requesting user can cancel an insight job.",
      );
    }

    if (!["QUEUED", "LEASED", "RUNNING"].includes(job.status)) {
      throw new ConflictException(
        `Job in status ${job.status} cannot be canceled.`,
      );
    }

    const canceled = await this.prisma.insightJob.update({
      where: { id: jobId },
      data: {
        status: "CANCELLED",
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      },
    });

    return this.mapJobDto(canceled);
  }

  async claimJob(
    deviceContext: AuthenticatedDeviceContext,
    request: CompanionClaimRequest,
  ): Promise<CompanionClaimResponse> {
    if (request.deviceId !== deviceContext.deviceId) {
      throw new BadRequestException("Device ID mismatch.");
    }
    // Find oldest QUEUED job for device's household
    const job = await this.prisma.insightJob.findFirst({
      where: {
        householdId: deviceContext.householdId,
        status: "QUEUED",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "asc" },
    });

    if (!job) {
      return {
        claimedJob: null,
        leaseToken: null,
        leaseExpiresAt: null,
      };
    }

    const leaseToken = randomUUID();
    const leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const updated = await this.prisma.insightJob.update({
      where: { id: job.id },
      data: {
        status: "LEASED",
        assignedDeviceId: deviceContext.deviceId,
        leaseToken,
        leaseExpiresAt,
        attempts: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    return {
      claimedJob: this.mapJobDto(updated),
      leaseToken,
      leaseExpiresAt: leaseExpiresAt.toISOString(),
    };
  }

  async getEvidenceEnvelope(
    deviceContext: AuthenticatedDeviceContext,
    jobId: string,
  ): Promise<CompanionEvidenceResponse> {
    const job = await this.prisma.insightJob.findFirst({
      where: {
        id: jobId,
        householdId: deviceContext.householdId,
        assignedDeviceId: deviceContext.deviceId,
      },
    });

    if (!job || !job.leaseToken || !job.leaseExpiresAt) {
      throw new NotFoundException("No active lease for this job.");
    }

    if (job.leaseExpiresAt < new Date()) {
      throw new ConflictException("Job lease has expired.");
    }

    // Intersect account grants: accounts permitted to this device
    const deviceGrants = await this.prisma.deviceAccountGrant.findMany({
      where: {
        deviceId: deviceContext.deviceId,
        permission: { in: ["TOTALS", "TRANSACTIONS"] },
      },
      include: {
        account: {
          include: {
            balances: {
              orderBy: { asOfDate: "desc" },
              take: 1,
            },
            transactions: {
              orderBy: { bookedDate: "desc" },
              take: 10,
            },
          },
        },
      },
    });

    // If personal scope, filter to requester's accounts
    const permittedAccounts = (
      deviceGrants as unknown as PermittedDeviceGrant[]
    ).filter((g: PermittedDeviceGrant) => {
      if (job.audienceScope === "PERSONAL") {
        return g.ownerUserId === job.requesterUserId;
      }
      return true;
    });

    const evidenceData = {
      jobId: job.id,
      householdId: job.householdId,
      featureType: job.featureType,
      parameters: job.parameters,
      accounts: permittedAccounts.map((g: PermittedDeviceGrant) => ({
        accountId: g.accountId,
        permission: g.permission,
        currency: g.account.currency,
        label: g.account.label,
        balance: g.account.balances[0]
          ? {
              amount: g.account.balances[0].amountMinor.toString(),
              recordedAt: g.account.balances[0].asOfDate.toISOString(),
            }
          : null,
        transactions:
          g.permission === "TRANSACTIONS"
            ? g.account.transactions.map(
                (
                  t: PermittedDeviceGrant["account"]["transactions"][number],
                ) => ({
                  id: t.id,
                  amount: t.amountMinor.toString(),
                  description: t.description,
                  bookedAt: t.bookedDate.toISOString(),
                }),
              )
            : [],
      })),
      timestamp: new Date().toISOString(),
    };

    const aadContext = `${job.id}:${deviceContext.deviceId}:${job.audienceScope}:${job.grantVersion}`;
    const envelope = encryptEvidenceEnvelope(
      evidenceData,
      aadContext,
      this.envelopeKey,
    );

    // Save evidenceHash to job
    await this.prisma.insightJob.update({
      where: { id: job.id },
      data: {
        evidenceHash: envelope.evidenceHash,
        updatedAt: new Date(),
      },
    });

    const envelopeExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15-minute max life

    return {
      jobId: job.id,
      deviceId: deviceContext.deviceId,
      audienceScope: job.audienceScope as "PERSONAL" | "HOUSEHOLD",
      grantVersion: job.grantVersion,
      envelopeCiphertext: envelope.envelopeCiphertext,
      envelopeIv: envelope.envelopeIv,
      envelopeTag: envelope.envelopeTag,
      evidenceHash: envelope.evidenceHash,
      expiresAt: envelopeExpiresAt.toISOString(),
    };
  }

  async checkPermit(
    deviceContext: AuthenticatedDeviceContext,
    jobId: string,
    request: CompanionPermitRequest,
  ): Promise<CompanionPermitResponse> {
    const job = await this.prisma.insightJob.findFirst({
      where: {
        id: jobId,
        householdId: deviceContext.householdId,
        assignedDeviceId: deviceContext.deviceId,
      },
    });

    if (!job) {
      return {
        permitted: false,
        reason: "JOB_NOT_FOUND",
        currentGrantVersion: 0,
      };
    }

    if (job.status === "REVOKED" || job.status === "CANCELLED") {
      return {
        permitted: false,
        reason: `JOB_${job.status}`,
        currentGrantVersion: job.grantVersion,
      };
    }

    if (job.leaseToken !== request.leaseToken) {
      return {
        permitted: false,
        reason: "LEASE_TOKEN_MISMATCH",
        currentGrantVersion: job.grantVersion,
      };
    }

    if (!job.leaseExpiresAt || job.leaseExpiresAt < new Date()) {
      return {
        permitted: false,
        reason: "LEASE_EXPIRED",
        currentGrantVersion: job.grantVersion,
      };
    }

    // Transition to RUNNING
    await this.prisma.insightJob.update({
      where: { id: job.id },
      data: {
        status: "RUNNING",
        updatedAt: new Date(),
      },
    });

    return {
      permitted: true,
      currentGrantVersion: job.grantVersion,
    };
  }

  async renewLease(
    deviceContext: AuthenticatedDeviceContext,
    jobId: string,
    request: CompanionRenewRequest,
  ): Promise<CompanionRenewResponse> {
    const job = await this.prisma.insightJob.findFirst({
      where: {
        id: jobId,
        householdId: deviceContext.householdId,
        assignedDeviceId: deviceContext.deviceId,
        leaseToken: request.leaseToken,
      },
    });

    if (!job || !["LEASED", "RUNNING"].includes(job.status)) {
      throw new NotFoundException("Active lease not found.");
    }

    if (job.leaseRenewals >= 2) {
      throw new ConflictException(
        "Maximum lease renewals reached (15-minute run limit).",
      );
    }

    const newLeaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const updated = await this.prisma.insightJob.update({
      where: { id: job.id },
      data: {
        leaseExpiresAt: newLeaseExpiresAt,
        leaseRenewals: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    return {
      renewed: true,
      leaseExpiresAt: newLeaseExpiresAt.toISOString(),
      renewalsRemaining: 2 - updated.leaseRenewals,
    };
  }

  async completeJob(
    deviceContext: AuthenticatedDeviceContext,
    jobId: string,
    request: CompanionCompleteRequest,
  ): Promise<CompanionCompleteResponse> {
    const job = await this.prisma.insightJob.findFirst({
      where: {
        id: jobId,
        householdId: deviceContext.householdId,
        assignedDeviceId: deviceContext.deviceId,
        leaseToken: request.leaseToken,
      },
    });

    if (!job || !["LEASED", "RUNNING"].includes(job.status)) {
      throw new NotFoundException("Active lease not found.");
    }

    if (!job.leaseExpiresAt || job.leaseExpiresAt < new Date()) {
      throw new ConflictException("Cannot complete an expired job lease.");
    }

    if (job.evidenceHash !== request.evidenceHash) {
      throw new BadRequestException(
        "Evidence hash does not match leased snapshot.",
      );
    }

    if (job.grantVersion !== request.grantVersion) {
      throw new ConflictException(
        "Account grant version changed during inference. Result rejected for privacy.",
      );
    }

    // Strictly verify cryptographic signature of the result payload and evidence hash
    const payloadBytes =
      request.evidenceHash + ":" + JSON.stringify(request.resultPayload);
    const validSignature = verifyDeviceSignature(
      deviceContext.publicKey,
      payloadBytes,
      request.signature,
    );

    if (!validSignature) {
      throw new BadRequestException(
        "Result cryptographic signature verification failed.",
      );
    }

    // Transition to VALIDATED and AVAILABLE
    const completed = await this.prisma.insightJob.update({
      where: { id: job.id },
      data: {
        status: "AVAILABLE",
        resultPayload: request.resultPayload as Prisma.InputJsonValue,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      },
    });

    return {
      accepted: true,
      jobId: completed.id,
      status: completed.status,
    };
  }

  private mapJobDto(job: {
    id: string;
    householdId: string;
    requesterUserId: string;
    audienceScope: string;
    status: string;
    featureType: string;
    parameters: unknown;
    assignedDeviceId: string | null;
    leaseExpiresAt: Date | null;
    attempts: number;
    maxAttempts: number;
    resultPayload: unknown;
    grantVersion: number;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
  }): InsightJobDto {
    return {
      id: job.id,
      householdId: job.householdId,
      requesterUserId: job.requesterUserId,
      audienceScope: job.audienceScope as "PERSONAL" | "HOUSEHOLD",
      status: job.status as InsightJobDto["status"],
      featureType: job.featureType as InsightJobDto["featureType"],
      parameters: (job.parameters as Record<string, unknown>) ?? {},
      assignedDeviceId: job.assignedDeviceId,
      leaseExpiresAt: job.leaseExpiresAt
        ? job.leaseExpiresAt.toISOString()
        : null,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      resultPayload: (job.resultPayload as Record<string, unknown>) ?? null,
      grantVersion: job.grantVersion,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      expiresAt: job.expiresAt.toISOString(),
    };
  }
}
