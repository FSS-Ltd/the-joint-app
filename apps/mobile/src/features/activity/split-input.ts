import {
  transactionSplitsSchema,
  type ClassificationKind,
  type TransactionResponse,
} from "@joint/contracts";
import { parseMoneyInput } from "@joint/domain";
import { validateSplits } from "@joint/domain/cash-flow";
import type { InputResult } from "../accounts/write-input";

export type SplitsInput = ReturnType<typeof transactionSplitsSchema.parse>;
export type SplitLineDraft = {
  category: string;
  amount: string;
  classificationKind: ClassificationKind;
};
/** An empty list is only the explicit "clear split" request. */
export type SplitsDraft = { lines: SplitLineDraft[] };
export const maxSplitLines = 20;

/** Owners may split an unpaired, non-zero row; the server enforces the same rules. */
export function splitsAllowed(transaction: TransactionResponse): boolean {
  return (
    transaction.permissions.canClassify &&
    transaction.transfer?.confirmed !== true &&
    BigInt(transaction.money.amountMinor) !== 0n
  );
}
/** Exact decimal text for a signed minor-unit string; never passes through Number. */
function minorToInput(minor: string): string {
  const value = BigInt(minor);
  const magnitude = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${magnitude / 100n}.${(magnitude % 100n)
    .toString()
    .padStart(2, "0")}`;
}
export function blankSplitLine(
  transaction: TransactionResponse,
): SplitLineDraft {
  return {
    category: "",
    amount: "",
    classificationKind: transaction.effectiveKind ?? "UNCLASSIFIED",
  };
}
export function splitsDraft(transaction: TransactionResponse): SplitsDraft {
  if (transaction.splits.length > 0)
    return {
      lines: transaction.splits.map((split) => ({
        category: split.category ?? "",
        amount: minorToInput(split.money.amountMinor),
        classificationKind: split.classificationKind,
      })),
    };
  return { lines: [blankSplitLine(transaction), blankSplitLine(transaction)] };
}
/** Minor units still to allocate, or null while any entered amount cannot be read. */
export function splitRemaining(
  transaction: TransactionResponse,
  draft: SplitsDraft,
): string | null {
  try {
    let remaining = BigInt(transaction.money.amountMinor);
    for (const line of draft.lines)
      if (line.amount.trim() !== "")
        remaining -= BigInt(parseMoneyInput(line.amount).amountMinor);
    return remaining.toString();
  } catch {
    return null;
  }
}
const invalid =
  "Use two to twenty non-zero signed amounts that add exactly to the transaction, each with a financial type that fits its sign.";
export function splitsInput(
  transaction: TransactionResponse,
  draft: SplitsDraft,
): InputResult<SplitsInput> {
  if (!splitsAllowed(transaction))
    return { ok: false, message: "This transaction cannot be split." };
  if (draft.lines.length === 0)
    return transaction.splits.length > 0
      ? { ok: true, value: { lines: [] } }
      : { ok: false, message: "There is no split to clear." };
  try {
    const lines = draft.lines.map((line) => ({
      category: line.category.trim() || null,
      money: parseMoneyInput(line.amount),
      classificationKind: line.classificationKind,
    }));
    validateSplits(transaction.money, lines);
    const parsed = transactionSplitsSchema.safeParse({ lines });
    if (!parsed.success) return { ok: false, message: invalid };
    const saved = transaction.splits;
    if (
      saved.length === parsed.data.lines.length &&
      parsed.data.lines.every(
        (next, index) =>
          saved[index]?.category === next.category &&
          saved[index]?.money.amountMinor === next.money.amountMinor &&
          saved[index]?.classificationKind === next.classificationKind,
      )
    )
      return { ok: false, message: "Change the components before saving." };
    return { ok: true, value: parsed.data };
  } catch {
    return { ok: false, message: invalid };
  }
}
