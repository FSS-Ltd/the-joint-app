import {
  importCommitSchema,
  importReviewSchema,
  type ImportBatchResponse,
} from "@joint/contracts";
import type { InputResult } from "../accounts/write-input";

export type ReviewChoices = Readonly<Record<number, "KEEP" | "SKIP">>;
export type ReviewDraft = { choices: ReviewChoices };
export type ReviewInput = ReturnType<typeof importReviewSchema.parse>;
export type CommitDraft = { acknowledged: boolean };
export type CommitInput = ReturnType<typeof importCommitSchema.parse>;

/** Decisions and commit exist only for a READY preview the caller may commit. */
export function importDecidable(batch: ImportBatchResponse): boolean {
  return batch.state === "READY" && batch.permissions.canCommit;
}
export function reviewInput(
  batch: ImportBatchResponse,
  draft: ReviewDraft,
): InputResult<ReviewInput> {
  if (!importDecidable(batch))
    return { ok: false, message: "This import can no longer be reviewed." };
  const decisions = Object.entries(draft.choices).map(
    ([rowNumber, decision]) => ({ rowNumber: Number(rowNumber), decision }),
  );
  if (decisions.length === 0)
    return { ok: false, message: "Choose Keep or Skip for at least one row." };
  if (decisions.length > 100)
    return { ok: false, message: "Save at most 100 decisions at a time." };
  const parsed = importReviewSchema.safeParse({ decisions });
  return parsed.success
    ? { ok: true, value: parsed.data }
    : {
        ok: false,
        message: "Those choices could not be saved. Reload the rows.",
      };
}
export function commitInput(
  batch: ImportBatchResponse,
  draft: CommitDraft,
): InputResult<CommitInput> {
  if (!importDecidable(batch))
    return { ok: false, message: "This import can no longer be committed." };
  if (batch.overlapRows > 0)
    return {
      ok: false,
      message: "Choose Keep or Skip for every possible overlap first.",
    };
  if (batch.rejectedRows > 0 && !draft.acknowledged)
    return {
      ok: false,
      message: "Confirm that the rejected rows will not be imported.",
    };
  if (batch.validRows === 0)
    return { ok: false, message: "There are no valid rows to import." };
  const parsed = importCommitSchema.safeParse({
    acceptRejectedRows: batch.rejectedRows > 0 && draft.acknowledged,
  });
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, message: "This import could not be committed." };
}
