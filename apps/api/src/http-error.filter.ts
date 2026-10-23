import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { diagnosticLine } from "@joint/database/diagnostics";
interface SafeResponse {
  status(code: number): SafeResponse;
  header(name: string, value: string): SafeResponse;
  json(value: unknown): void;
}
const knownErrors: Record<string, string> = {
  PRIVACY_UNAVAILABLE:
    "Local privacy controls need setup. Run pnpm privacy:setup after auth:setup, then restart the API and worker.",
  INVALID_SCOPE: "Select between one and fifty distinct available accounts.",
  SCOPE_SELECTION_REQUIRED:
    "Select up to fifty accounts before requesting a report.",
  SCOPE_CHANGED:
    "Account access or financial details changed. Refresh this report.",
  INVALID_CLASSIFICATION:
    "Choose a classification consistent with the amount's direction.",
  CLASSIFICATION_LOCKED:
    "Remove the transfer link or clear the splits before changing financial details.",
  INVALID_SPLITS:
    "Use two to twenty nonzero lines that add exactly to the original amount, with valid classifications.",
  INVALID_TRANSFER:
    "Choose two unpaired booked transactions in accounts you own with equal opposite amounts.",
  OPEN_COVERAGE_PERIOD:
    "Only a closed calendar month can have complete history confirmed.",
  IMPORTS_UNAVAILABLE:
    "Local imports are unavailable. Run pnpm imports:setup and restart the API and worker.",
  IMPORT_BUSY:
    "An import is already processing for this account. Wait for it to finish or retry its failed commit.",
  IMPORT_NOT_READY:
    "This import is not ready for this action. Refresh its status.",
  IMPORT_EXPIRED:
    "This preview expired. Upload the file again to create a fresh preview.",
  IMPORT_REVIEW_REQUIRED:
    "Review the highlighted rows before committing this import.",
  IMPORT_REJECTS_UNCONFIRMED:
    "Confirm that rejected rows will be excluded before committing.",
  IMPORT_PROTECTED:
    "This import has later edits or notes and cannot be rolled back.",
  PREVIEW_STALE:
    "Account activity changed. Upload the file again and review a fresh preview.",
  SOURCE_IMMUTABLE:
    "Imported financial details cannot be edited. Use classifications or a separate manual correction.",
  CSV_INVALID_MAPPING:
    "Choose distinct available columns and a consistent amount format.",
  CSV_INVALID_FORMAT:
    "Use a valid comma-separated CSV file with correctly quoted fields.",
  CSV_INVALID_ENCODING: "Save the CSV file using UTF-8 encoding.",
  CSV_INVALID_HEADERS:
    "Use a non-empty header row with column names no longer than 128 characters.",
  CSV_EMPTY: "Choose a CSV file containing a header and transaction rows.",
  CSV_TOO_LARGE: "Choose a CSV file no larger than 10 MiB.",
  CSV_TOO_MANY_ROWS:
    "Split this CSV into files containing at most 50,000 transaction rows.",
  CSV_TOO_MANY_COLUMNS: "Use a CSV file containing at most 100 columns.",
  CSV_RECORD_TOO_LARGE: "Each CSV record must be no larger than 64 KiB.",

  INVITATION_UNAVAILABLE:
    "This invitation is unavailable. Ask for a new invitation.",
  ADMIN_REQUIRED: "Only a household admin can create invitations.",
  INVITE_SELF: "Choose the other adult's verified email address.",
  HOUSEHOLD_FULL: "This household already has two adult members.",
  HOUSEHOLD_EXISTS: "You already belong to a household.",
  IDEMPOTENCY_CONFLICT: "This request key was used with different details.",
  MFA_REQUIRED: "Verify your authenticator before continuing.",
  MFA_REAUTH_REQUIRED:
    "Verify your authenticator again before this sensitive action.",
  VERSION_CONFLICT: "This account changed. Refresh it before trying again.",
  INVALID_CURSOR: "This account list changed. Refresh it to continue.",
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
    const requestId = randomUUID();
    process.stderr.write(
      diagnosticLine({ code: "API_REQUEST_REJECTED", requestId, status }),
    );
    response
      .status(status)
      .header("Cache-Control", "no-store")
      .header("X-Request-Id", requestId)
      .json({ error: safeError });
  }
}
