import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@joint/database/client";
import type {
  CompletePairingRequest,
  CompletePairingResponse,
  DeviceSessionRequest,
  DeviceSessionResponse,
  SessionChallengeRequest,
  SessionChallengeResponse,
} from "@joint/contracts";
import {
  computeFingerprint,
  hashToken,
  verifyDeviceSignature,
} from "./device-crypto.js";

export interface AuthenticatedDeviceContext {
  readonly deviceId: string;
  readonly householdId: string;
  readonly keyVersion: number;
  readonly publicKey: string;
}

@Injectable()
export class DeviceAuthService {
  constructor(private readonly prisma: PrismaClient) {}

  async completePairing(
    request: CompletePairingRequest,
  ): Promise<CompletePairingResponse> {
    const pairing = await this.prisma.devicePairingCode.findFirst({
      where: {
        code: request.pairingCode,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!pairing) {
      throw new BadRequestException("Invalid or expired pairing code.");
    }

    const fingerprint = computeFingerprint(request.publicKey);

    // Strictly verify cryptographic proof of possession (signature over pairing code)
    const validProof = verifyDeviceSignature(
      request.publicKey,
      request.pairingCode,
      request.proofOfPossession,
    );

    if (!validProof) {
      await this.prisma.devicePairingCode.delete({
        where: { id: pairing.id },
      });
      throw new BadRequestException("Invalid proof of key possession.");
    }

    // Check if device already exists with this fingerprint in this household
    let device = await this.prisma.device.findFirst({
      where: {
        householdId: pairing.householdId,
        fingerprint,
      },
    });

    if (device) {
      if (device.status === "REVOKED") {
        throw new ForbiddenException(
          "This device was previously revoked. Use a new keypair.",
        );
      }
      device = await this.prisma.device.update({
        where: { id: device.id },
        data: {
          name: request.name,
          publicKey: request.publicKey,
          updatedAt: new Date(),
        },
      });
    } else {
      device = await this.prisma.device.create({
        data: {
          householdId: pairing.householdId,
          name: request.name,
          fingerprint,
          publicKey: request.publicKey,
          status: "PENDING",
          pairedByUserId: pairing.createdBy,
        },
      });
    }

    // Mark pairing code consumed
    await this.prisma.devicePairingCode.update({
      where: { id: pairing.id },
      data: {
        consumedAt: new Date(),
        deviceId: device.id,
      },
    });

    return {
      deviceId: device.id,
      householdId: device.householdId,
      fingerprint: device.fingerprint,
      status: device.status,
    };
  }

  async createSessionChallenge(
    request: SessionChallengeRequest,
  ): Promise<SessionChallengeResponse> {
    const device = await this.prisma.device.findFirst({
      where: { id: request.deviceId },
    });

    if (!device) throw new NotFoundException("Device not found.");
    if (device.status !== "APPROVED") {
      throw new ForbiddenException(
        "Device has not been approved by household owner.",
      );
    }

    const nonce = randomBytes(32).toString("hex");
    const nonceExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Create session record holding the nonce challenge
    await this.prisma.deviceSession.create({
      data: {
        deviceId: device.id,
        tokenHash: hashToken("challenge_" + nonce),
        nonce,
        nonceExpiresAt,
        expiresAt: nonceExpiresAt,
      },
    });

    return {
      nonce,
      expiresAt: nonceExpiresAt.toISOString(),
    };
  }

  async authenticateSession(
    request: DeviceSessionRequest,
  ): Promise<DeviceSessionResponse> {
    const sessionRecord = await this.prisma.deviceSession.findFirst({
      where: {
        deviceId: request.deviceId,
        nonce: request.nonce,
        revokedAt: null,
        nonceExpiresAt: { gt: new Date() },
      },
      include: { device: true },
    });

    if (!sessionRecord || !sessionRecord.device) {
      throw new UnauthorizedException("Invalid or expired session challenge.");
    }

    if (sessionRecord.device.status !== "APPROVED") {
      throw new ForbiddenException("Device is not approved.");
    }

    // Strictly verify signature over the challenge nonce
    const signatureValid = verifyDeviceSignature(
      sessionRecord.device.publicKey,
      request.nonce,
      request.signature,
    );

    if (!signatureValid) {
      await this.prisma.deviceSession.delete({
        where: { id: sessionRecord.id },
      });
      throw new UnauthorizedException(
        "Cryptographic challenge verification failed.",
      );
    }

    // Issue 1-hour session token
    const sessionToken = "dev_" + randomBytes(32).toString("hex");
    const tokenHash = hashToken(sessionToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Update session with token hash and clear nonce
      await tx.deviceSession.update({
        where: { id: sessionRecord.id },
        data: {
          tokenHash,
          nonce: null,
          nonceExpiresAt: null,
          expiresAt,
        },
      });

      // Update device last seen
      await tx.device.update({
        where: { id: sessionRecord.deviceId },
        data: { lastSeenAt: new Date() },
      });
    });

    return {
      sessionToken,
      deviceId: sessionRecord.deviceId,
      householdId: sessionRecord.device.householdId,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async authenticateDeviceToken(
    token: string,
  ): Promise<AuthenticatedDeviceContext> {
    if (!token || !token.startsWith("dev_")) {
      throw new UnauthorizedException(
        "Missing or invalid companion device token.",
      );
    }

    const tokenHash = hashToken(token);
    const session = await this.prisma.deviceSession.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { device: true },
    });

    if (!session || !session.device) {
      throw new UnauthorizedException("Device session expired or invalid.");
    }

    if (session.device.status !== "APPROVED") {
      throw new ForbiddenException("Device is revoked or unapproved.");
    }

    return {
      deviceId: session.deviceId,
      householdId: session.device.householdId,
      keyVersion: session.device.keyVersion,
      publicKey: session.device.publicKey,
    };
  }
}
