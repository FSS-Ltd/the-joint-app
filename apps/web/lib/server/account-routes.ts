import {
  accountCreateSchema,
  accountListQuerySchema,
  accountListSchema,
  accountPatchSchema,
  accountSchema,
  grantInputSchema,
  idempotencyKeySchema,
  quotedVersionSchema,
  valuationInputSchema,
} from "@joint/contracts";
import { assertMutation, sessionToken } from "./browser-security";
import { requestBody } from "./request-body";
import { BffError, json, parseResponse, route } from "./responses";
import { upstream } from "./upstream";

function validId(value: string): string {
  const parsed = idempotencyKeySchema.safeParse(value);
  if (!parsed.success)
    throw new BffError(
      400,
      "INVALID_INPUT",
      "This account could not be found.",
    );
  return parsed.data;
}
function key(request: Request): string {
  const parsed = idempotencyKeySchema.safeParse(
    request.headers.get("Idempotency-Key"),
  );
  if (!parsed.success)
    throw new BffError(
      400,
      "INVALID_INPUT",
      "This request needs a valid request key. Please try again.",
    );
  return parsed.data;
}
function version(request: Request): string {
  const header = request.headers.get("If-Match");
  if (!quotedVersionSchema.safeParse(header).success || header === null)
    throw new BffError(
      400,
      "INVALID_INPUT",
      "Reload the account and try again.",
    );
  return header;
}

export function listAccounts(
  request: Request,
  householdId: string,
): Promise<Response> {
  return route(async () => {
    const token = sessionToken(request);
    const id = validId(householdId);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((name) => params.getAll(name).length !== 1))
      throw new BffError(
        400,
        "INVALID_INPUT",
        "Check the account list options and try again.",
      );
    const parsed = accountListQuerySchema.safeParse(Object.fromEntries(params));
    if (!parsed.success)
      throw new BffError(
        400,
        "INVALID_INPUT",
        "Check the account list options and try again.",
      );
    const query = new URLSearchParams({ limit: String(parsed.data.limit) });
    if (parsed.data.cursor) query.set("cursor", parsed.data.cursor);
    return json(
      parseResponse(
        accountListSchema,
        await upstream(`/v1/households/${id}/accounts`, { token, query }),
      ),
    );
  });
}

export function getAccount(
  request: Request,
  householdId: string,
  accountId: string,
): Promise<Response> {
  return route(async () => {
    const token = sessionToken(request);
    return json(
      parseResponse(
        accountSchema,
        await upstream(
          `/v1/households/${validId(householdId)}/accounts/${validId(accountId)}`,
          { token },
        ),
      ),
    );
  });
}

export function createAccount(
  request: Request,
  householdId: string,
): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = sessionToken(request);
    const id = validId(householdId);
    const idempotencyKey = key(request);
    const body = await requestBody(request, accountCreateSchema);
    return json(
      parseResponse(
        accountSchema,
        await upstream(`/v1/households/${id}/accounts`, {
          token,
          body,
          idempotencyKey,
        }),
      ),
    );
  });
}

export function patchAccount(
  request: Request,
  householdId: string,
  accountId: string,
): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = sessionToken(request);
    const path =
      `/v1/households/${validId(householdId)}/accounts/${validId(accountId)}` as const;
    const ifMatch = version(request);
    const body = await requestBody(request, accountPatchSchema);
    return json(
      parseResponse(
        accountSchema,
        await upstream(path, { token, body, method: "PATCH", ifMatch }),
      ),
    );
  });
}

export function valueAccount(
  request: Request,
  householdId: string,
  accountId: string,
): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = sessionToken(request);
    const path =
      `/v1/households/${validId(householdId)}/accounts/${validId(accountId)}/valuations` as const;
    const ifMatch = version(request);
    const idempotencyKey = key(request);
    const body = await requestBody(request, valuationInputSchema);
    return json(
      parseResponse(
        accountSchema,
        await upstream(path, { token, body, ifMatch, idempotencyKey }),
      ),
    );
  });
}

export function grantAccount(
  request: Request,
  householdId: string,
  accountId: string,
  membershipId: string,
): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = sessionToken(request);
    const path =
      `/v1/households/${validId(householdId)}/accounts/${validId(accountId)}/grants/${validId(membershipId)}` as const;
    const ifMatch = version(request);
    const body = await requestBody(request, grantInputSchema);
    return json(
      parseResponse(
        accountSchema,
        await upstream(path, { token, body, method: "PUT", ifMatch }),
      ),
    );
  });
}
