import {
  authResultSchema,
  readAuthProvider,
  emptyObjectSchema,
  logoutSchema,
  mfaCodeSchema,
  mfaEnrollmentSchema,
  passwordResetSchema,
  recoverySchema,
  signInSchema,
  signUpSchema,
  verifyEmailSchema,
} from "@joint/contracts";
import {
  assertMutation,
  LOGOUT_CLEANUP_COOKIE,
  CSRF_COOKIE,
  INVITATION_COOKIE,
  SESSION_COOKIE,
  sessionToken,
  setCookie,
} from "./browser-security";
import { requestBody } from "./request-body";
import { BffError, json, parseResponse, route, type Schema } from "./responses";
import { upstream } from "./upstream";

type Operation =
  | "signup"
  | "login"
  | "verify"
  | "recovery"
  | "password"
  | "mfa/enroll"
  | "mfa/verify"
  | "logout";
type AuthState =
  | "VERIFY_EMAIL"
  | "AUTHENTICATED"
  | "MFA_REQUIRED"
  | "PASSWORD_RESET_REQUIRED"
  | "SIGNED_OUT";
const operations: Record<
  Operation,
  {
    input: Schema<object>;
    authenticated: boolean;
    states: readonly AuthState[];
  }
> = {
  signup: {
    input: signUpSchema,
    authenticated: false,
    states: ["VERIFY_EMAIL"],
  },
  login: {
    input: signInSchema,
    authenticated: false,
    states: ["AUTHENTICATED", "MFA_REQUIRED"],
  },
  verify: {
    input: verifyEmailSchema,
    authenticated: false,
    states: ["AUTHENTICATED", "MFA_REQUIRED", "PASSWORD_RESET_REQUIRED"],
  },
  recovery: {
    input: recoverySchema,
    authenticated: false,
    states: ["VERIFY_EMAIL"],
  },
  password: {
    input: passwordResetSchema,
    authenticated: true,
    states: ["AUTHENTICATED"],
  },
  "mfa/enroll": { input: emptyObjectSchema, authenticated: true, states: [] },
  "mfa/verify": {
    input: mfaCodeSchema,
    authenticated: true,
    states: ["AUTHENTICATED", "PASSWORD_RESET_REQUIRED"],
  },
  logout: { input: logoutSchema, authenticated: true, states: ["SIGNED_OUT"] },
};

export function authPost(
  request: Request,
  operation: Operation,
): Promise<Response> {
  return route(async () => {
    assertMutation(request);
    const definition = operations[operation];
    const token = definition.authenticated
      ? await sessionToken(request)
      : undefined;
    const body = await requestBody(request, definition.input);
    const value = await upstream(`/v1/auth/${operation}`, {
      body,
      ...(token ? { token } : {}),
    });
    if (operation === "mfa/enroll")
      return json(parseResponse(mfaEnrollmentSchema, value));
    const result = parseResponse(authResultSchema, value);
    const createsSession = operation === "login" || operation === "verify";
    if (
      !definition.states.includes(result.state) ||
      (createsSession && !result.browserToken) ||
      (!createsSession && result.browserToken)
    ) {
      throw new BffError(
        503,
        "INVALID_RESPONSE",
        "This service is unavailable. Please try again shortly.",
      );
    }
    const response = json({
      state: result.state,
      ...(result.providerCleanupPending
        ? { providerCleanupPending: true }
        : {}),
    });
    if (result.browserToken)
      setCookie(
        response,
        SESSION_COOKIE,
        result.browserToken,
        7 * 86400,
        "Lax",
      );
    if (operation === "logout") {
      if (readAuthProvider(process.env) === "clerk") {
        if (result.providerCleanupPending && !result.providerCleanupToken)
          throw new BffError(
            503,
            "INVALID_RESPONSE",
            "Sign-out cleanup could not be prepared. Retry sign-out.",
          );
        setCookie(
          response,
          LOGOUT_CLEANUP_COOKIE,
          result.providerCleanupToken ?? "",
          result.providerCleanupPending ? 1800 : 0,
          "Strict",
        );
      }
      setCookie(response, SESSION_COOKIE, "", 0, "Lax");
      setCookie(response, CSRF_COOKIE, "", 0, "Strict");
      setCookie(response, INVITATION_COOKIE, "", 0, "Lax");
    }
    return response;
  });
}
