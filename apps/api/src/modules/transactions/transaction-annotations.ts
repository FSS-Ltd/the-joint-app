import { NotFoundException } from "@nestjs/common";
import type {
  AuthContext,
  transactionAnnotationSchema,
} from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import {
  lockActor,
  recordChange,
  requireVersion,
} from "../accounts/account-transaction.js";
import {
  lockTransactionAccount,
  ownsAccount,
  readTransaction,
} from "./transaction-projection.js";

type AnnotationInput = ReturnType<typeof transactionAnnotationSchema.parse>;
export class TransactionAnnotations {
  constructor(private readonly database: ScopedDatabase) {}
  annotate(
    context: AuthContext,
    id: string,
    input: AnnotationInput,
    version: number,
  ) {
    return this.database.withScope(context, async (tx) => {
      await lockActor(tx, context);
      const current = await lockTransactionAccount(tx, context, id, false);
      requireVersion(current.version, version);
      if (input.category !== undefined || input.merchant !== undefined) {
        if (!(await ownsAccount(tx, context, current.accountId)))
          throw new NotFoundException();
        const before = await tx.transactionOverride.findUnique({
          where: { transactionId: id },
        });
        const category =
          input.category === undefined
            ? (before?.category ?? null)
            : input.category;
        const merchant =
          input.merchant === undefined
            ? (before?.merchant ?? null)
            : input.merchant;
        await tx.transactionOverride.upsert({
          where: { transactionId: id },
          create: {
            householdId: context.householdId,
            accountId: current.accountId,
            transactionId: id,
            authorMembershipId: context.membershipId,
            category,
            merchant,
          },
          update: { category, merchant, version: { increment: 1 } },
          select: { transactionId: true },
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
            kind: "CLASSIFICATION",
            data: {
              before: {
                category: before?.category ?? null,
                merchant: before?.merchant ?? null,
              },
              after: { category, merchant },
            },
          },
          select: { id: true },
        });
      }
      if (input.note !== undefined && input.noteVersion !== undefined) {
        const where = {
          transactionId_authorUserId: {
            transactionId: id,
            authorUserId: context.userId,
          },
        };
        const existing = await tx.transactionNote.findUnique({ where });
        requireVersion(existing?.version ?? 0, input.noteVersion);
        await tx.transactionNote.upsert({
          where,
          create: {
            householdId: context.householdId,
            accountId: current.accountId,
            transactionId: id,
            authorUserId: context.userId,
            authorMembershipId: context.membershipId,
            body: input.note,
          },
          update: { body: input.note, version: { increment: 1 } },
          select: { transactionId: true },
        });
      }
      await recordChange(
        tx,
        context,
        input.category !== undefined || input.merchant !== undefined
          ? "TRANSACTION_ANNOTATED"
          : "TRANSACTION_NOTE_UPDATED",
      );
      return readTransaction(tx, context, id);
    });
  }
}
