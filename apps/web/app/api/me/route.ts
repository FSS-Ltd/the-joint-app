import { meResponseSchema } from "@joint/contracts";
import { sessionToken } from "../../../lib/server/browser-security";
import { json, parseResponse, route } from "../../../lib/server/responses";
import { upstream } from "../../../lib/server/upstream";

export function GET(request: Request): Promise<Response> {
  return route(async () => {
    const token = sessionToken(request);
    return json(
      parseResponse(meResponseSchema, await upstream("/v1/me", { token })),
    );
  });
}
