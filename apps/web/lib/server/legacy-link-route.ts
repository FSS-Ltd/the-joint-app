import {
  authResultSchema,
  mfaCodeSchema,
  readAuthProvider,
} from "@joint/contracts";
import {
  assertMutation,
  readCookie,
  SESSION_COOKIE,
  sessionToken,
  setCookie,
} from "./browser-security";
import { requestBody } from "./request-body";
import { BffError, json, parseResponse, route } from "./responses";
import { upstream } from "./upstream";

export function linkLegacy(request: Request): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    if (readAuthProvider(process.env) !== "clerk")
      throw new BffError(503, "UNAVAILABLE", "Account linking is unavailable.");
    const legacyToken = readCookie(request, SESSION_COOKIE);
    if (!legacyToken)
      throw new BffError(
        401,
        "LEGACY_SESSION_REQUIRED",
        "Sign in to your existing account and verify its authenticator before linking.",
      );
    const body = await requestBody(request, mfaCodeSchema);
    if (body.factorId !== "clerk_totp")
      throw new BffError(
        400,
        "INVALID_INPUT",
        "Enter your current authenticator code.",
      );
    const value = await upstream("/v1/auth/link-legacy", {
      token: await sessionToken(request),
      legacyToken,
      body,
    });
    const result = parseResponse(authResultSchema, value);
    if (result.state !== "AUTHENTICATED" || result.browserToken)
      throw new BffError(
        503,
        "INVALID_RESPONSE",
        "Account linking is unavailable.",
      );
    const response = json({ state: result.state });
    setCookie(response, SESSION_COOKIE, "", 0, "Lax");
    return response;
  });
}
