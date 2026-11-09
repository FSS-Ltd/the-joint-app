import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, PrismaClient } from "@joint/database/client";
import type {
  ApproveDeviceRequest,
  AuthContext,
  DeviceAccountGrantDto,
  DeviceDto,
  StartPairingRequest,
  StartPairingResponse,
  UpdateDeviceAccountGrantsRequest,
} from "@joint/contracts";
import type { EntitlementService } from "../entitlements/entitlement.service.js";
import { computeFingerprint, generatePairingCode } from "./device-crypto.js";

interface DeviceRow {
  id: string;
  householdId: string;
  name: string;
  fingerprint: string;
  publicKey: string;
  keyVersion: number;
  status: "PENDING" | "APPROVED" | "REVOKED";
  pairedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date | null;
}

interface GrantRow {
  id: string;
  deviceId: string;
  accountId: string;
  ownerUserId: string;
  permission: "NONE" | "TOTALS" | "TRANSACTIONS";
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly entitlements: EntitlementService,
  ) {}

  async listDevices(context: AuthContext): Promise<DeviceDto[]> {
    const devices = await this.prisma.device.findMany({
      where: {
        householdId: context.householdId,
        status: { in: ["PENDING", "APPROVED"] },
      },
      orderBy: { createdAt: "desc" },
    });

    return devices.map((d: DeviceRow) => ({
      id: d.id,
      householdId: d.householdId,
      name: d.name,
      fingerprint: d.fingerprint,
      publicKey: d.publicKey,
      keyVersion: d.keyVersion,
      status: d.status,
      pairedByUserId: d.pairedByUserId,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
    }));
  }

  async startPairing(
    context: AuthContext,
    request?: StartPairingRequest,
  ): Promise<StartPairingResponse> {
    void request;
    const entitlement = await this.entitlements.read(context);
    if (
      !entitlement.capabilities.includes("insights.local") ||
      entitlement.caps.companionDevices < 1
    ) {
      throw new ForbiddenException(
        "Household plan does not include companion device pairing.",
      );
    }

    const activeCount = await this.prisma.device.count({
      where: {
        householdId: context.householdId,
        status: "APPROVED",
      },
    });

    if (activeCount >= entitlement.caps.companionDevices) {
      throw new ConflictException(
        "Household companion device limit reached. Revoke an existing device first.",
      );
    }

    const code = generatePairingCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const fingerprintPlaceholder = computeFingerprint(
      code + ":" + context.householdId,
    );

    await this.prisma.devicePairingCode.create({
      data: {
        householdId: context.householdId,
        code,
        fingerprint: fingerprintPlaceholder,
        createdBy: context.userId,
        expiresAt,
      },
    });

    return {
      pairingCode: code,
      fingerprint: fingerprintPlaceholder,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async approveDevice(
    context: AuthContext,
    deviceId: string,
    request: ApproveDeviceRequest,
  ): Promise<DeviceDto> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, householdId: context.householdId },
    });

    if (!device) throw new NotFoundException("Device not found.");
    if (device.status === "REVOKED") {
      throw new ConflictException("Revoked devices cannot be approved.");
    }
    if (device.fingerprint !== request.fingerprint) {
      throw new BadRequestException("Device fingerprint does not match.");
    }

    const entitlement = await this.entitlements.read(context);
    if (
      !entitlement.capabilities.includes("insights.local") ||
      entitlement.caps.companionDevices < 1
    ) {
      throw new ForbiddenException(
        "Household plan does not include companion devices.",
      );
    }

    const approved = await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        status: "APPROVED",
        updatedAt: new Date(),
      },
    });

    return {
      id: approved.id,
      householdId: approved.householdId,
      name: approved.name,
      fingerprint: approved.fingerprint,
      publicKey: approved.publicKey,
      keyVersion: approved.keyVersion,
      status: approved.status,
      pairedByUserId: approved.pairedByUserId,
      createdAt: approved.createdAt.toISOString(),
      updatedAt: approved.updatedAt.toISOString(),
      lastSeenAt: approved.lastSeenAt
        ? approved.lastSeenAt.toISOString()
        : null,
    };
  }

  async getDeviceAccountGrants(
    context: AuthContext,
    deviceId: string,
  ): Promise<DeviceAccountGrantDto[]> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, householdId: context.householdId },
    });
    if (!device) throw new NotFoundException("Device not found.");

    // Return only accounts owned by the caller
    const grants = await this.prisma.deviceAccountGrant.findMany({
      where: {
        deviceId,
        ownerUserId: context.userId,
      },
      include: { account: true },
    });

    return grants.map((g: GrantRow) => ({
      id: g.id,
      deviceId: g.deviceId,
      accountId: g.accountId,
      ownerUserId: g.ownerUserId,
      permission: g.permission,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    }));
  }

  async updateDeviceAccountGrants(
    context: AuthContext,
    deviceId: string,
    request: UpdateDeviceAccountGrantsRequest,
  ): Promise<DeviceAccountGrantDto[]> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, householdId: context.householdId },
    });
    if (!device) throw new NotFoundException("Device not found.");
    if (device.status !== "APPROVED") {
      throw new ConflictException(
        "Grants can only be configured for approved devices.",
      );
    }

    // Verify all requested accounts are owned by the caller in this household
    const accountIds = request.grants.map((g) => g.accountId);
    const ownedAccounts = await this.prisma.account.findMany({
      where: {
        id: { in: accountIds },
        householdId: context.householdId,
        creatorUserId: context.userId,
        archivedAt: null,
      },
      select: { id: true },
    });

    const ownedSet = new Set(ownedAccounts.map((a: { id: string }) => a.id));
    for (const grant of request.grants) {
      if (!ownedSet.has(grant.accountId)) {
        throw new ForbiddenException(
          `User does not have owner authority over account ${grant.accountId}.`,
        );
      }
    }

    const updatedGrants: DeviceAccountGrantDto[] = [];
    for (const grant of request.grants) {
      const upserted = await this.prisma.deviceAccountGrant.upsert({
        where: {
          deviceId_accountId: {
            deviceId,
            accountId: grant.accountId,
          },
        },
        create: {
          deviceId,
          accountId: grant.accountId,
          ownerUserId: context.userId,
          permission: grant.permission,
        },
        update: {
          permission: grant.permission,
          updatedAt: new Date(),
        },
      });

      updatedGrants.push({
        id: upserted.id,
        deviceId: upserted.deviceId,
        accountId: upserted.accountId,
        ownerUserId: upserted.ownerUserId,
        permission: upserted.permission,
        createdAt: upserted.createdAt.toISOString(),
        updatedAt: upserted.updatedAt.toISOString(),
      });
    }

    // Increment grantVersion on any queued/leased jobs to invalidate stale evidence snapshots
    await this.prisma.insightJob.updateMany({
      where: {
        householdId: context.householdId,
        status: { in: ["QUEUED", "LEASED", "RUNNING"] },
      },
      data: {
        grantVersion: { increment: 1 },
      },
    });

    return updatedGrants;
  }

  async revokeDevice(context: AuthContext, deviceId: string): Promise<void> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, householdId: context.householdId },
    });
    if (!device) throw new NotFoundException("Device not found.");

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Mark device revoked
      await tx.device.update({
        where: { id: deviceId },
        data: { status: "REVOKED", updatedAt: new Date() },
      });

      // 2. Revoke all active sessions
      await tx.deviceSession.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 3. Revoke any pending or active jobs assigned to this device
      await tx.insightJob.updateMany({
        where: {
          assignedDeviceId: deviceId,
          status: { in: ["LEASED", "RUNNING"] },
        },
        data: {
          status: "REVOKED",
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
    });
  }
}
