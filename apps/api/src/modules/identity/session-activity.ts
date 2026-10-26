import { UnauthorizedException } from "@nestjs/common";
import type { Prisma } from "@joint/database/client";
import type { SessionDeadline } from "@joint/contracts";
import { databaseErrorCode } from "../../database-error.js";

export async function sessionDeadline(
  transaction: Prisma.TransactionClient,
  sessionId: string,
  activityAgeMs: number | null = null,
): Promise<SessionDeadline> {
  try {
    const [row] = await transaction.$queryRaw<
      { expiresAt: Date; serverTime: Date }[]
    >`SELECT * FROM app.session_idle_deadline(${sessionId}::uuid,${activityAgeMs}::integer)`;
    if (!row) throw new UnauthorizedException();
    return {
      expiresAt: row.expiresAt.toISOString(),
      serverTime: row.serverTime.toISOString(),
    };
  } catch (error) {
    if (databaseErrorCode(error) === "42501") throw new UnauthorizedException();
    throw error;
  }
}
