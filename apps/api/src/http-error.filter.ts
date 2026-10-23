import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
interface SafeResponse {
  status(code: number): SafeResponse;
  header(name: string, value: string): SafeResponse;
  json(value: unknown): void;
}
const knownErrors: Record<string, string> = {
  INVITATION_UNAVAILABLE:
    "This invitation is unavailable. Ask for a new invitation.",
  ADMIN_REQUIRED: "Only a household admin can create invitations.",
  INVITE_SELF: "Choose the other adult's verified email address.",
  HOUSEHOLD_FULL: "This household already has two adult members.",
  HOUSEHOLD_EXISTS: "You already belong to a household.",
  IDEMPOTENCY_CONFLICT: "This request key was used with different details.",
  MFA_REQUIRED: "Verify your authenticator before continuing.",
  SESSION_UNAVAILABLE: "Session unavailable. Sign in again or retry shortly.",
};
const messages: Record<number, { code: string; message: string }> = {
  400: {
    code: "INVALID_INPUT",
    message: "Check the supplied fields and try again.",
  },
  401: { code: "UNAUTHORIZED", message: "Sign in again to continue." },
  403: {
    code: "FORBIDDEN",
    message: "This action is not available for your current session.",
  },
  404: { code: "NOT_FOUND", message: "The requested item is unavailable." },
  409: {
    code: "CONFLICT",
    message: "This action conflicts with the current household state.",
  },
  413: { code: "INVALID_INPUT", message: "The request is too large." },
};
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const bodyLimit =
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.too.large";
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : bodyLimit
          ? 413
          : 503;
    const response = host.switchToHttp().getResponse<SafeResponse>();
    const path = host
      .switchToHttp()
      .getRequest<{ url?: string }>()
      .url?.split("?")[0];
    if (status === 503 && path === "/health/ready") {
      response
        .status(503)
        .header("Cache-Control", "no-store")
        .json({ status: "unavailable" });
      return;
    }
    const body: unknown =
      error instanceof HttpException ? error.getResponse() : null;
    const code =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      "code" in body.error &&
      typeof body.error.code === "string"
        ? body.error.code
        : "";
    const safeError = knownErrors[code]
      ? { code, message: knownErrors[code] }
      : (messages[status] ?? {
          code: "UNAVAILABLE",
          message:
            "This service is temporarily unavailable. Try again shortly.",
        });
    response
      .status(status)
      .header("Cache-Control", "no-store")
      .json({ error: safeError });
  }
}
