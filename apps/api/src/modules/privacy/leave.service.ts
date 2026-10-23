import type { AuthContext } from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import type { PrivacyJournal } from "@joint/database/privacy-journal";
import { randomUUID } from "node:crypto";

export interface LeaveResult {
  left: true;
  householdId: string;
  membershipId: string;
  affectedAccountIds: string[];
}

export class LeaveService {
  constructor(private readonly database: ScopedDatabase) {}

  async leave(context: AuthContext): Promise<LeaveResult> {
    return this.apply(context);
  }

  async leaveWithJournal(
    context: AuthContext,
    requestId: string,
    journal: PrivacyJournal,
  ): Promise<LeaveResult> {
    return this.apply(context, () =>
      journal.append({
        version: 1,
        kind: "LEAVE_HOUSEHOLD",
        eventId: randomUUID(),
        requestId,
        userId: context.userId,
        householdId: context.householdId,
        recordedAt: new Date().toISOString(),
      }),
    );
  }

  private async apply(
    context: AuthContext,
    beforeLeave?: () => Promise<void>,
  ): Promise<LeaveResult> {
    return this.database.withScope(context, async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      await beforeLeave?.();
      const accounts = await tx.$queryRaw<
        { id: string }[]
      >`SELECT app.leave_household() AS id`;
      return {
        left: true,
        householdId: context.householdId,
        membershipId: context.membershipId,
        affectedAccountIds: accounts.map((account) => account.id),
      };
    });
  }
}
