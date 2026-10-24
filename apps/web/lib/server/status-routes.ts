import { statusSubscriptionSchema } from "@joint/contracts";
import { assertSubscriptionRequest, sessionToken } from "./browser-security";
import { sessionAuthorization } from "./clerk-session";
import { financeQuery } from "./finance-boundary";
import { deletionAuthorization } from "./privacy-receipt";
import { BffError, route } from "./responses";
import { statusUpstream } from "./status-upstream";

export function sessionStatusStream(request: Request): Promise<Response> {
  return route(async () => {
    assertSubscriptionRequest(request);
    const query = financeQuery(request, statusSubscriptionSchema);
    if (query.get("kind") === "deletion")
      throw new BffError(400, "INVALID_INPUT", "This status is unavailable.");
    return statusUpstream(
      request,
      query,
      sessionAuthorization(await sessionToken(request)),
    );
  });
}
export function deletionStatusStream(
  request: Request,
  id: string,
): Promise<Response> {
  return route(async () => {
    assertSubscriptionRequest(request);
    const receipt = deletionAuthorization(request, id);
    return statusUpstream(
      request,
      new URLSearchParams({ kind: "deletion", id: receipt.id }),
      receipt.authorization,
    );
  });
}
