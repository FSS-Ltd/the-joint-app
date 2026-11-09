import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { PrismaClient } from "@joint/database/client";
import type { StaffRole } from "@joint/contracts";
import { readIdentityToken } from "../../identity-header.js";
import type { IdentityAccess } from "../identity/identity.service.js";

export interface StaffAuthContext {
  staffMemberId: string;
  userId: string;
  role: StaffRole;
}

@Injectable()
export class StaffAuthService {
  constructor(
    private readonly database: PrismaClient,
    private readonly identity: IdentityAccess,
  ) {}

  async authenticateStaff(
    authHeader: string | undefined,
    action: string = "STAFF_ACCESS",
    targetResource?: string,
  ): Promise<StaffAuthContext> {
    const token = readIdentityToken(authHeader);
    if (!token) {
      throw new UnauthorizedException("Authentication token required.");
    }

    // 1. Authenticate identity through primary session registry
    const principal = await this.identity.actor(token);
    if (!principal || !principal.userId) {
      throw new UnauthorizedException("Invalid session identity.");
    }

    // 2. Query explicit staff authority table (denied by default)
    // Household membership, purchaser status, email domain never grant staff access
    const activeStaffMembers = await this.database.staffMember.findMany({
      where: {
        userId: principal.userId,
        revokedAt: null,
      },
    });

    if (activeStaffMembers.length === 0) {
      throw new ForbiddenException(
        "Access denied. Explicit staff authority required.",
      );
    }

    // Deterministically resolve highest granted authority
    const adminRecord = activeStaffMembers.find(
      (m) => m.role === "STAFF_ADMIN",
    );
    const staffMember = adminRecord ?? activeStaffMembers[0]!;

    // 3. Write immutable audit record
    await this.database.staffAudit.create({
      data: {
        staffMemberId: staffMember.id,
        userId: principal.userId,
        action,
        targetResource: targetResource ?? null,
      },
    });

    return {
      staffMemberId: staffMember.id,
      userId: principal.userId,
      role: staffMember.role as StaffRole,
    };
  }
}
