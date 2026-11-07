import { randomUUID } from "expo-crypto";
import type { ImportBatchResponse } from "@joint/contracts";
import {
  useEntityWrite,
  type EntityWriteSession,
  type EntityWriteSpec,
} from "../writes/use-entity-write";
import {
  commitInput,
  importDecidable,
  reviewInput,
  type CommitDraft,
  type ReviewDraft,
} from "./review-input";
import { commitIntent, reviewIntent } from "./review-intent";
import { useImportRead } from "./use-import-read";

type Spec<D> = EntityWriteSpec<ImportBatchResponse, D, ImportBatchResponse>;
export type ImportReviewSession = EntityWriteSession<
  ImportBatchResponse,
  ReviewDraft,
  ImportBatchResponse
>;
export type ImportCommitSession = EntityWriteSession<
  ImportBatchResponse,
  CommitDraft,
  ImportBatchResponse
>;
const review: Spec<ReviewDraft> = {
  name: "import-review",
  empty: () => ({ choices: {} }),
  draft: () => ({ choices: {} }),
  allowed: importDecidable,
  intent(finance, batch, draft) {
    const input = reviewInput(batch, draft);
    return input.ok
      ? { ok: true, value: reviewIntent(finance, batch, input.value) }
      : input;
  },
};
const commit: Spec<CommitDraft> = {
  name: "import-commit",
  empty: () => ({ acknowledged: false }),
  draft: () => ({ acknowledged: false }),
  allowed: importDecidable,
  intent(finance, batch, draft) {
    const input = commitInput(batch, draft);
    return input.ok
      ? {
          ok: true,
          value: commitIntent(finance, batch, input.value, randomUUID()),
        }
      : input;
  },
};
export function useImportReviewWrite(batchId: string): ImportReviewSession {
  return useEntityWrite(
    `import-review:${batchId}`,
    useImportRead(batchId),
    review,
  );
}
export function useImportCommitWrite(batchId: string): ImportCommitSession {
  return useEntityWrite(
    `import-commit:${batchId}`,
    useImportRead(batchId),
    commit,
  );
}
