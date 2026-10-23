import {
  authResultSchema,
  emptyObjectSchema,
  readAuthProvider,
} from "@joint/contracts";
import {
  assertMutation,
  LOGOUT_CLEANUP_COOKIE,
  readCookie,
  setCookie,
} from "../../../../../lib/server/browser-security";
import { requestBody } from "../../../../../lib/server/request-body";
import {
  BffError,
  json,
  parseResponse,
  route,
} from "../../../../../lib/server/responses";
import { upstream } from "../../../../../lib/server/upstream";

export function POST(request: Request): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    await requestBody(request, emptyObjectSchema);
    if (readAuthProvider(process.env) !== "clerk")
      throw new BffError(404, "NOT_FOUND", "This operation is unavailable.");
    const ticket = readCookie(request, LOGOUT_CLEANUP_COOKIE);
    if (!ticket)
      throw new BffError(
        401,
        "CLEANUP_EXPIRED",
        "Sign-out cleanup expired. Sign in again to manage your sessions.",
      );
    const result = parseResponse(
      authResultSchema,
      await upstream("/v1/auth/logout/retry", {
        body: {},
        logoutCleanup: ticket,
      }),
    );
    if (
      result.state !== "SIGNED_OUT" ||
      result.browserToken ||
      (result.providerCleanupPending && !result.providerCleanupToken)
    )
      throw new BffError(
        503,
        "INVALID_RESPONSE",
        "Sign-out cleanup could not finish. Try again.",
      );
    const response = json({
      state: "SIGNED_OUT",
      providerCleanupPending: result.providerCleanupPending === true,
    });
    if (!result.providerCleanupPending)
      setCookie(response, LOGOUT_CLEANUP_COOKIE, "", 0, "Strict");
    return response;
  });
}
