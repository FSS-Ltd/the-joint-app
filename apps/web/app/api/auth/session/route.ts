import { sessionActivitySchema, sessionDeadlineSchema } from "@joint/contracts";
import {
  assertMutation,
  sessionToken,
} from "../../../../lib/server/browser-security";
import { requestBody } from "../../../../lib/server/request-body";
import { json, parseResponse, route } from "../../../../lib/server/responses";
import { upstream } from "../../../../lib/server/upstream";

export function GET(request: Request): Promise<Response> {
  return route(async () => {
    const token = await sessionToken(request);
    return json(
      parseResponse(
        sessionDeadlineSchema,
        await upstream("/v1/auth/session", { token }),
      ),
    );
  });
}
export function POST(request: Request): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const token = await sessionToken(request);
    const body = await requestBody(request, sessionActivitySchema);
    return json(
      parseResponse(
        sessionDeadlineSchema,
        await upstream("/v1/auth/session", { token, body }),
      ),
    );
  });
}
