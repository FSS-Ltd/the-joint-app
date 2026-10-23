import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@joint/database/client";
import {
  householdSummarySchema,
  invitationCreatedSchema,
} from "@joint/contracts";
import type { HouseholdSummary, InvitationCreated } from "@joint/contracts";
import {
  hashToken,
  newOpaqueToken,
  type IdentityVault,
} from "../identity/identity-vault.js";
import type { IdentityPrincipal } from "../identity/identity-context.js";
import type { RequestReplay } from "./request-replay.js";
import { audit, bindSessions, lockHousehold } from "./household-transaction.js";

const unavailableInvitation = (): NotFoundException =>
  new NotFoundException({
    error: {
      code: "INVITATION_UNAVAILABLE",
      message:
        "This invitation is unavailable or belongs to another verified email.",
    },
  });

export class HouseholdInvitations {
  constructor(
    private readonly vault: IdentityVault,
    private readonly requests: RequestReplay,
  ) {}

  async issue(
    tx: Prisma.TransactionClient,
    principal: IdentityPrincipal,
    householdId: string,
    email: string,
    key: string,
  ): Promise<InvitationCreated> {
    await lockHousehold(tx, householdId);
    const membership = await tx.membership.findFirst({
      where: { userId: principal.userId, householdId, status: "ACTIVE" },
    });
    if (!membership) throw new NotFoundException();
    if (membership.role !== "ADMIN")
      throw new ForbiddenException({
        error: {
          code: "ADMIN_REQUIRED",
          message: "Only the household organiser can invite another adult.",
        },
      });
    const emailHash = this.vault.emailHash(email);
    const payloadHash = hashToken(JSON.stringify({ householdId, emailHash }));
    const replay = await this.requests.read(
      tx,
      principal.userId,
      "households.invite",
      key,
      payloadHash,
      invitationCreatedSchema,
    );
    if (replay) return replay;
    if (emailHash === principal.emailHash)
      throw new ConflictException({
        error: {
          code: "INVITE_SELF",
          message: "Invite the other adult using their own email address.",
        },
      });
    if (
      (await tx.membership.count({
        where: { householdId, status: "ACTIVE" },
      })) >= 2
    )
      throw new ConflictException({
        error: {
          code: "HOUSEHOLD_FULL",
          message: "This household already has two adults.",
        },
      });
    await tx.invitation.updateMany({
      where: { householdId, consumedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const token = newOpaqueToken();
    const expiresAt = new Date(Date.now() + 7 * 86400_000);
    const invitation = await tx.invitation.create({
      data: {
        householdId,
        issuedByUserId: principal.userId,
        emailHash,
        tokenHash: hashToken(token),
        expiresAt,
      },
    });
    const result = {
      id: invitation.id,
      token,
      expiresAt: expiresAt.toISOString(),
    };
    await this.requests.save(
      tx,
      principal.userId,
      "households.invite",
      key,
      payloadHash,
      result,
    );
    await audit(tx, principal.userId, householdId, "invitation.created");
    return result;
  }

  async accept(
    tx: Prisma.TransactionClient,
    principal: IdentityPrincipal,
    token: string,
  ): Promise<HouseholdSummary> {
    const tokenHash = hashToken(token);
    const candidate = await tx.invitation.findUnique({
      where: { tokenHash },
      select: { householdId: true },
    });
    if (!candidate) throw unavailableInvitation();
    await lockHousehold(tx, candidate.householdId);
    const invitation = await tx.invitation.findUnique({
      where: { tokenHash },
    });
    if (
      !invitation ||
      invitation.emailHash !== principal.emailHash ||
      invitation.consumedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date()
    )
      throw unavailableInvitation();
    if (
      await tx.membership.findFirst({
        where: { userId: principal.userId, status: "ACTIVE" },
      })
    )
      throw new ConflictException({
        error: {
          code: "HOUSEHOLD_EXISTS",
          message: "You already belong to a household.",
        },
      });
    const members = await tx.membership.findMany({
      where: { householdId: invitation.householdId, status: "ACTIVE" },
      select: { slot: true },
    });
    if (members.length >= 2)
      throw new ConflictException({
        error: {
          code: "HOUSEHOLD_FULL",
          message: "This household already has two adults.",
        },
      });
    const slot = members.some((member) => member.slot === 1) ? 2 : 1;
    await tx.membership.upsert({
      where: {
        userId_householdId: {
          userId: principal.userId,
          householdId: invitation.householdId,
        },
      },
      create: {
        userId: principal.userId,
        householdId: invitation.householdId,
        role: "MEMBER",
        slot,
      },
      update: {
        role: "MEMBER",
        slot,
        status: "ACTIVE",
        acceptedAt: new Date(),
        grantVersion: { increment: 1 },
      },
    });
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { consumedAt: new Date() },
    });
    await tx.invitation.updateMany({
      where: {
        householdId: invitation.householdId,
        consumedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    await bindSessions(tx, principal.userId, invitation.householdId);
    await audit(
      tx,
      principal.userId,
      invitation.householdId,
      "invitation.accepted",
    );
    return householdSummarySchema.parse(
      await tx.household.findUniqueOrThrow({
        where: { id: invitation.householdId },
        select: { id: true, name: true, baseCurrency: true, timezone: true },
      }),
    );
  }
}
