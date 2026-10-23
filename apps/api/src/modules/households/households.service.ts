import { ConflictException } from "@nestjs/common";
import type { PrismaClient } from "@joint/database/client";
import { householdSummarySchema } from "@joint/contracts";
import type { HouseholdSummary, InvitationCreated } from "@joint/contracts";
import { hashToken, type IdentityVault } from "../identity/identity-vault.js";
import type { IdentityPrincipal } from "../identity/identity-context.js";
import { RequestReplay } from "./request-replay.js";
import { HouseholdInvitations } from "./household-invitations.js";
import { asActor, audit, bindSessions } from "./household-transaction.js";

export class HouseholdService {
  private readonly requests: RequestReplay;
  private readonly invitations: HouseholdInvitations;
  constructor(
    private readonly database: PrismaClient,
    vault: IdentityVault,
  ) {
    this.requests = new RequestReplay(vault);
    this.invitations = new HouseholdInvitations(vault, this.requests);
  }

  async create(
    principal: IdentityPrincipal,
    input: { name: string },
    key: string,
  ): Promise<HouseholdSummary> {
    return asActor(this.database, principal, async (tx) => {
      const payloadHash = hashToken(JSON.stringify({ name: input.name }));
      const replay = await this.requests.read(
        tx,
        principal.userId,
        "households.create",
        key,
        payloadHash,
        householdSummarySchema,
      );
      if (replay) return replay;
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
      const household = await tx.household.create({
        data: {
          name: input.name,
          memberships: {
            create: { userId: principal.userId, role: "ADMIN", slot: 1 },
          },
        },
        select: { id: true, name: true, baseCurrency: true, timezone: true },
      });
      const result = householdSummarySchema.parse(household);
      await bindSessions(tx, principal.userId, result.id);
      await audit(tx, principal.userId, result.id, "household.created");
      await this.requests.save(
        tx,
        principal.userId,
        "households.create",
        key,
        payloadHash,
        result,
      );
      return result;
    });
  }

  async invite(
    principal: IdentityPrincipal,
    householdId: string,
    email: string,
    key: string,
  ): Promise<InvitationCreated> {
    return asActor(this.database, principal, (tx) =>
      this.invitations.issue(tx, principal, householdId, email, key),
    );
  }

  async acceptInvite(
    principal: IdentityPrincipal,
    token: string,
  ): Promise<HouseholdSummary> {
    return asActor(this.database, principal, (tx) =>
      this.invitations.accept(tx, principal, token),
    );
  }
}
