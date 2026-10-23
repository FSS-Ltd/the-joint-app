import {
  transactionAnnotationSchema,
  transactionCreateSchema,
  transactionListQuerySchema,
  transactionListSchema,
  transactionPatchSchema,
  transactionSchema,
} from "@joint/contracts";
import { assertMutation, sessionToken } from "./browser-security";
import {
  financeId,
  financeKey,
  financeQuery,
  financeVersion,
} from "./finance-boundary";
import { requestBody } from "./request-body";
import { json, parseResponse, route } from "./responses";
import { upstream } from "./upstream";

export function listTransactions(
  request: Request,
  householdId: string,
): Promise<Response> {
  return route(async () =>
    json(
      parseResponse(
        transactionListSchema,
        await upstream(
          `/v1/households/${financeId(householdId)}/transactions`,
          {
            token: await sessionToken(request),
            query: financeQuery(request, transactionListQuerySchema),
          },
        ),
      ),
    ),
  );
}
export function getTransaction(
  request: Request,
  householdId: string,
  transactionId: string,
): Promise<Response> {
  return route(async () =>
    json(
      parseResponse(
        transactionSchema,
        await upstream(
          `/v1/households/${financeId(householdId)}/transactions/${financeId(transactionId)}`,
          { token: await sessionToken(request) },
        ),
      ),
    ),
  );
}
export function createTransaction(
  request: Request,
  householdId: string,
): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = await sessionToken(request);
    const household = financeId(householdId);
    const idempotencyKey = financeKey(request);
    const body = await requestBody(request, transactionCreateSchema);
    return json(
      parseResponse(
        transactionSchema,
        await upstream(`/v1/households/${household}/transactions`, {
          token,
          body,
          idempotencyKey,
        }),
      ),
    );
  });
}
export function patchTransaction(
  request: Request,
  householdId: string,
  transactionId: string,
  annotation = false,
): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = await sessionToken(request);
    const path =
      `/v1/households/${financeId(householdId)}/transactions/${financeId(transactionId)}` as const;
    const ifMatch = financeVersion(request);
    if (annotation) {
      const body = await requestBody(request, transactionAnnotationSchema);
      return json(
        parseResponse(
          transactionSchema,
          await upstream(`${path}/annotation`, {
            token,
            body,
            ifMatch,
            method: "PATCH",
          }),
        ),
      );
    }
    const body = await requestBody(request, transactionPatchSchema);
    return json(
      parseResponse(
        transactionSchema,
        await upstream(path, { token, body, ifMatch, method: "PATCH" }),
      ),
    );
  });
}
