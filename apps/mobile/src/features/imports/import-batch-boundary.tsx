import type { ReactNode } from "react";
import type { ImportBatchResponse } from "@joint/contracts";
import { EntityWriteBoundary } from "../writes/entity-write-boundary";
import type { EntityWriteSession } from "../writes/use-entity-write";

/** Import-batch copy and destinations over the shared write boundary. */
export function ImportBatchBoundary<D>({
  session,
  batchId,
  title,
  saved,
  pending,
  viewOnly = "This import can no longer be reviewed or committed.",
  header,
  children,
}: {
  session: EntityWriteSession<ImportBatchResponse, D, ImportBatchResponse>;
  batchId: string;
  title: string;
  saved: string;
  pending: string;
  viewOnly?: string;
  header?: (batch: ImportBatchResponse) => ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  const batch = `/imports/${batchId}`;
  return (
    <EntityWriteBoundary
      session={session}
      title={title}
      viewOnly={viewOnly}
      header={header}
      retryLabel="Retry import access"
      reloadLabel="Reload import"
      backHref={batch}
      backLabel="Back to import"
      outcome={{
        saved,
        open: "Back to import",
        openHref: () => batch,
        pending,
        check: "Check import",
        checkHref: batch,
      }}
    >
      {children}
    </EntityWriteBoundary>
  );
}
