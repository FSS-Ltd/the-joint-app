import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  transferResultSchema,
  type AuthContext,
  type transferConfirmSchema,
  type transferRemoveSchema,
} from "@joint/contracts";
import type { ScopedDatabase } from "@joint/database/scoped";
import {
  lockActor,
  recordChange,
  requireVersion,
} from "../accounts/account-transaction.js";
import { RequestReplay } from "../households/request-replay.js";
import { hashToken, type IdentityVault } from "../identity/identity-vault.js";
import { pairedTransactionIds } from "../transactions/transaction-projection.js";
import {
  applyTransferKind,
  lockTransferLegs,
  transferResult,
  type TransferResult,
} from "./transfer-transaction.js";

type ConfirmInput = ReturnType<typeof transferConfirmSchema.parse>;
type RemoveInput = ReturnType<typeof transferRemoveSchema.parse>;
export class TransfersService {
  private readonly replay: RequestReplay;
  constructor(
    private readonly database: ScopedDatabase,
    vault: IdentityVault,
  ) {
    this.replay = new RequestReplay(vault);
  }
  confirm(
    context: AuthContext,
    input: ConfirmInput,
    key: string,
  ): Promise<TransferResult> {
    const route = `transfer:${context.householdId}`,
      digest = hashToken(JSON.stringify(input));
    return this.database.withScope(context, async (tx) => {
      await lockActor(tx, context);
      const { from, to } = await lockTransferLegs(
        tx,
        context,
        input.fromTransactionId,
        input.toTransactionId,
      );
      const previous = await this.replay.read(
        tx,
        context.userId,
        route,
        key,
        digest,
        transferResultSchema,
      );
      if (previous) {
        const active = await tx.transferLink.findFirst({
          where: {
            id: previous.id,
            householdId: context.householdId,
            active: true,
          },
        });
        if (!active) throw new NotFoundException();
        return transferResult(
          tx,
          context,
          active.id,
          active.fromTransactionId,
          active.toTransactionId,
        );
      }
      requireVersion(from.version, input.fromVersion);
      requireVersion(to.version, input.toVersion);
      if (
        from.accountId === to.accountId ||
        from.currency !== "GBP" ||
        to.currency !== "GBP" ||
        from.amountMinor >= 0n ||
        to.amountMinor <= 0n ||
        from.amountMinor + to.amountMinor !== 0n
      )
        throw new BadRequestException({ error: { code: "INVALID_TRANSFER" } });
      if (
        (await pairedTransactionIds(tx, [from.id, to.id])).size ||
        (await tx.transactionSplit.count({
          where: { transactionId: { in: [from.id, to.id] } },
        }))
      )
        throw new ConflictException({
          error: { code: "CLASSIFICATION_LOCKED" },
        });
      await applyTransferKind(
        tx,
        context,
        from,
        "TRANSFER",
        "TRANSFER_CONFIRM",
      );
      await applyTransferKind(tx, context, to, "TRANSFER", "TRANSFER_CONFIRM");
      const link = await tx.transferLink.create({
        data: {
          householdId: context.householdId,
          fromAccountId: from.accountId,
          fromTransactionId: from.id,
          toAccountId: to.accountId,
          toTransactionId: to.id,
          beforeFromKind: from.override?.classificationKind ?? null,
          beforeToKind: to.override?.classificationKind ?? null,
        },
        select: { id: true },
      });
      await recordChange(tx, context, "TRANSFER_CONFIRMED");
      const result = await transferResult(tx, context, link.id, from.id, to.id);
      await this.replay.save(tx, context.userId, route, key, digest, result);
      return result;
    });
  }
  read(context: AuthContext, id: string): Promise<TransferResult> {
    return this.database.withScope(context, async (tx) => {
      const link = await tx.transferLink.findFirst({
        where: { id, householdId: context.householdId, active: true },
      });
      if (!link) throw new NotFoundException();
      return transferResult(
        tx,
        context,
        id,
        link.fromTransactionId,
        link.toTransactionId,
      );
    });
  }
  remove(
    context: AuthContext,
    id: string,
    input: RemoveInput,
  ): Promise<TransferResult> {
    return this.database.withScope(context, async (tx) => {
      await lockActor(tx, context);
      const link = await tx.transferLink.findFirst({
        where: { id, householdId: context.householdId, active: true },
      });
      if (!link) throw new NotFoundException();
      const { from, to } = await lockTransferLegs(
        tx,
        context,
        link.fromTransactionId,
        link.toTransactionId,
      );
      requireVersion(from.version, input.fromVersion);
      requireVersion(to.version, input.toVersion);
      await tx.transferLink.update({
        where: { id },
        data: { active: false, version: { increment: 1 } },
        select: { id: true },
      });
      await applyTransferKind(
        tx,
        context,
        from,
        link.beforeFromKind,
        "TRANSFER_REMOVE",
      );
      await applyTransferKind(
        tx,
        context,
        to,
        link.beforeToKind,
        "TRANSFER_REMOVE",
      );
      await recordChange(tx, context, "TRANSFER_REMOVED");
      return transferResult(tx, context, id, from.id, to.id);
    });
  }
}
