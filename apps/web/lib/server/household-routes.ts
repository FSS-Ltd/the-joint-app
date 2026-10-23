import {
  acceptInviteSchema,
  emptyObjectSchema,
  householdCreateSchema,
  householdSummarySchema,
  idempotencyKeySchema,
  invitationCreatedSchema,
  inviteSchema,
} from "@joint/contracts";
import {
  assertMutation,
  INVITATION_COOKIE,
  readCookie,
  sessionToken,
  setCookie,
} from "./browser-security";
import { requestBody } from "./request-body";
import {
  BffError,
  errorResponse,
  json,
  parseResponse,
  route,
} from "./responses";
import { upstream } from "./upstream";

function idempotencyKey(request: Request): string {
  const result = idempotencyKeySchema.safeParse(
    request.headers.get("Idempotency-Key"),
  );
  if (!result.success)
    throw new BffError(
      400,
      "INVALID_INPUT",
      "This request needs a valid request key. Please try again.",
    );
  return result.data;
}

export function createHousehold(request: Request): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = sessionToken(request);
    const key = idempotencyKey(request);
    const body = await requestBody(request, householdCreateSchema);
    return json(
      parseResponse(
        householdSummarySchema,
        await upstream("/v1/households", { body, token, idempotencyKey: key }),
      ),
    );
  });
}

export function inviteToHousehold(
  request: Request,
  householdId: string,
): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = sessionToken(request);
    const id = idempotencyKeySchema.safeParse(householdId);
    if (!id.success)
      throw new BffError(
        400,
        "INVALID_INPUT",
        "This household could not be found.",
      );
    const key = idempotencyKey(request);
    const body = await requestBody(request, inviteSchema);
    return json(
      parseResponse(
        invitationCreatedSchema,
        await upstream(`/v1/households/${id.data}/invitations`, {
          body,
          token,
          idempotencyKey: key,
        }),
      ),
    );
  });
}

export function captureInvitation(request: Request): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const body = await requestBody(request, acceptInviteSchema);
    const response = json({ state: "INVITATION_PENDING" });
    setCookie(response, INVITATION_COOKIE, body.token, 600, "Lax");
    return response;
  });
}

export function acceptInvitation(request: Request): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = sessionToken(request);
    await requestBody(request, emptyObjectSchema);
    const invitationToken = readCookie(request, INVITATION_COOKIE);
    if (!invitationToken)
      throw new BffError(
        400,
        "INVITATION_UNAVAILABLE",
        "Open your invitation link again, or ask your household admin for a new one.",
      );
    let value: unknown;
    try {
      value = await upstream("/v1/invitations/accept", {
        body: { token: invitationToken },
        token,
      });
    } catch (error) {
      if (!(error instanceof BffError) || error.status !== 404) throw error;
      const response = errorResponse(error);
      setCookie(response, INVITATION_COOKIE, "", 0, "Lax");
      return response;
    }
    const result = parseResponse(householdSummarySchema, value);
    const response = json(result);
    setCookie(response, INVITATION_COOKIE, "", 0, "Lax");
    return response;
  });
}
