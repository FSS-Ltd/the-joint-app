import {
  csvInspectionSchema,
  csvMappingSchema,
  importBatchSchema,
  importCommitSchema,
  importJobResultSchema,
  importListQuerySchema,
  importListSchema,
  importReviewSchema,
  importRowsQuerySchema,
  importRowsSchema,
} from "@joint/contracts";
import { assertMutation, sessionToken } from "./browser-security";
import { readCsvBody } from "./csv-body";
import {
  financeId,
  financeKey,
  financeQuery,
  financeVersion,
} from "./finance-boundary";
import { requestBody } from "./request-body";
import { BffError, json, parseResponse, route } from "./responses";
import { upstream } from "./upstream";

export function uploadCsv(
  request: Request,
  householdId: string,
  operation: "inspect" | "preview",
): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = sessionToken(request);
    const household = financeId(householdId);
    const accountId = financeId(request.headers.get("X-Account-Id") ?? "");
    let mapping: string | undefined;
    const idempotencyKey =
      operation === "preview" ? financeKey(request) : undefined;
    if (operation === "preview") {
      const header = request.headers.get("X-Import-Mapping");
      let value: unknown;
      try {
        if (!header || header.length > 4096) throw new Error();
        value = JSON.parse(decodeURIComponent(header));
      } catch {
        throw new BffError(
          400,
          "INVALID_MAPPING",
          "Choose valid columns and explicit date and amount conventions.",
        );
      }
      const parsed = csvMappingSchema.safeParse(value);
      if (!parsed.success)
        throw new BffError(
          400,
          "INVALID_MAPPING",
          "Choose different columns for each field and explicit date and amount conventions.",
        );
      mapping = encodeURIComponent(JSON.stringify(parsed.data));
    }
    const bytes = await readCsvBody(request);
    const value = await upstream(
      `/v1/households/${household}/imports/${operation}`,
      {
        token,
        csv: { bytes, accountId, ...(mapping ? { mapping } : {}) },
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
    );
    return json(
      operation === "inspect"
        ? parseResponse(csvInspectionSchema, value)
        : parseResponse(importJobResultSchema, value),
    );
  });
}
export function listImports(
  request: Request,
  householdId: string,
): Promise<Response> {
  return route(async () =>
    json(
      parseResponse(
        importListSchema,
        await upstream(`/v1/households/${financeId(householdId)}/imports`, {
          token: sessionToken(request),
          query: financeQuery(request, importListQuerySchema),
        }),
      ),
    ),
  );
}
export function readImport(
  request: Request,
  householdId: string,
  batchId: string,
  rows = false,
): Promise<Response> {
  return route(async () => {
    const token = sessionToken(request);
    const path =
      `/v1/households/${financeId(householdId)}/imports/${financeId(batchId)}` as const;
    const result = rows
      ? await upstream(`${path}/rows`, {
          token,
          query: financeQuery(request, importRowsQuerySchema),
        })
      : await upstream(path, { token });
    return json(
      rows
        ? parseResponse(importRowsSchema, result)
        : parseResponse(importBatchSchema, result),
    );
  });
}
export function mutateImport(
  request: Request,
  householdId: string,
  batchId: string,
  operation: "review" | "commit" | "rollback" | "original",
): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = sessionToken(request);
    const path =
      `/v1/households/${financeId(householdId)}/imports/${financeId(batchId)}` as const;
    const ifMatch = financeVersion(request);
    if (operation === "review") {
      const body = await requestBody(request, importReviewSchema);
      return json(
        parseResponse(
          importBatchSchema,
          await upstream(`${path}/review`, {
            token,
            body,
            ifMatch,
            method: "PATCH",
          }),
        ),
      );
    }
    if (operation === "commit") {
      const idempotencyKey = financeKey(request);
      const body = await requestBody(request, importCommitSchema);
      return json(
        parseResponse(
          importJobResultSchema,
          await upstream(`${path}/commit`, {
            token,
            body,
            ifMatch,
            idempotencyKey,
          }),
        ),
      );
    }
    const result = await upstream(
      operation === "original" ? `${path}/original` : path,
      { token, method: "DELETE", ...(ifMatch ? { ifMatch } : {}) },
    );
    return json(parseResponse(importBatchSchema, result));
  });
}
