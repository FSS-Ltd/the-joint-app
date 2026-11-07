import { randomUUID } from "expo-crypto";
import type { ImportBatchResponse } from "@joint/contracts";
import {
  useEntityWrite,
  type EntityWriteSession,
  type EntityWriteSpec,
} from "../writes/use-entity-write";
import { actionAllowed, type ImportAction } from "./action-input";
import { actionIntent } from "./action-intent";
import { useImportRead } from "./use-import-read";

/** These actions take no input: the screen itself is the confirmation. */
type Draft = Record<string, never>;
export type ImportActionSession = EntityWriteSession<
  ImportBatchResponse,
  Draft,
  ImportBatchResponse
>;
const spec = (
  action: ImportAction,
): EntityWriteSpec<ImportBatchResponse, Draft, ImportBatchResponse> => ({
  name: `import-${action}`,
  empty: () => ({}),
  draft: () => ({}),
  allowed: (batch) => actionAllowed(batch, action),
  intent: (finance, batch) => ({
    ok: true,
    value: actionIntent(
      finance,
      batch,
      action,
      action === "restore" ? randomUUID() : undefined,
    ),
  }),
});
// Stable module-level specs: the session's seeding effect depends on identity.
const specs = {
  rollback: spec("rollback"),
  restore: spec("restore"),
  original: spec("original"),
};
export function useImportActionWrite(
  batchId: string,
  action: ImportAction,
): ImportActionSession {
  return useEntityWrite(
    `import-${action}:${batchId}`,
    useImportRead(batchId),
    specs[action],
  );
}
