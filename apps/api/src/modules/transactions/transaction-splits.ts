import { BadRequestException, ConflictException } from "@nestjs/common";
import type { AuthContext, transactionSplitsSchema } from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import { validateSplits } from "@joint/domain/cash-flow";
import {
  lockActor,
  recordChange,
  requireVersion,
} from "../accounts/account-transaction.js";
import {
  lockTransactionAccount,
  pairedTransactionIds,
  readTransaction,
} from "./transaction-projection.js";

type Input = ReturnType<typeof transactionSplitsSchema.parse>;
export class TransactionSplits {
  constructor(private readonly database: ScopedDatabase) {}
  replace(context: AuthContext, id: string, input: Input, version: number) {
    return this.database.withScope(context, async (tx) => {
      await lockActor(tx, context);
      const current = await lockTransactionAccount(tx, context, id, true);
      requireVersion(current.version, version);
      if ((await pairedTransactionIds(tx, [id])).has(id))
        throw new ConflictException({
          error: { code: "CLASSIFICATION_LOCKED" },
        });
      const source = await tx.transaction.findUniqueOrThrow({ where: { id } });
      try {
        validateSplits(
          { amountMinor: source.amountMinor.toString(), currency: "GBP" },
          input.lines,
        );
      } catch {
        throw new BadRequestException({ error: { code: "INVALID_SPLITS" } });
      }
      const before = await tx.transactionSplit.findMany({
        where: { transactionId: id },
        orderBy: { position: "asc" },
      });
      await tx.transactionSplit.deleteMany({ where: { transactionId: id } });
      if (input.lines.length)
        await tx.transactionSplit.createMany({
          data: input.lines.map((line, position) => ({
            householdId: context.householdId,
            accountId: current.accountId,
            transactionId: id,
            position,
            category: line.category,
            amountMinor: BigInt(line.money.amountMinor),
            classificationKind: line.classificationKind,
          })),
        });
      await tx.transaction.update({
        where: { id },
        data: { version: { increment: 1 } },
        select: { id: true },
      });
      await tx.account.update({
        where: { id: current.accountId },
        data: { version: { increment: 1 } },
        select: { id: true },
      });
      await tx.transactionRevision.create({
        data: {
          householdId: context.householdId,
          accountId: current.accountId,
          transactionId: id,
          actorMembershipId: context.membershipId,
          version: current.version + 1,
          kind: "SPLIT",
          data: {
            before: before.map((line) => ({
              category: line.category,
              amountMinor: line.amountMinor.toString(),
              classificationKind: line.classificationKind,
            })),
            after: input.lines,
          },
        },
        select: { id: true },
      });
      await recordChange(tx, context, "TRANSACTION_SPLITS_UPDATED");
      return readTransaction(tx, context, id);
    });
  }
}
