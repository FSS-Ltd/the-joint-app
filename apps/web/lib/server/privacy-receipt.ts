import { financeId } from "./finance-boundary";
import { BffError } from "./responses";

export const DELETION_RECEIPT_COOKIE = "joint-deletion-receipt";
export function deletionAuthorization(
  request: Request,
  id: string,
): { id: string; authorization: string } {
  const valid = financeId(id);
  const matches = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${DELETION_RECEIPT_COOKIE}=`));
  const receipt =
    matches.length === 1
      ? matches[0]?.slice(DELETION_RECEIPT_COOKIE.length + 1)
      : undefined;
  const parsed = receipt?.match(/^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/i);
  if (!parsed || parsed[1] !== valid)
    throw new BffError(
      401,
      "RECEIPT_REQUIRED",
      "This deletion receipt is unavailable in this browser or has expired.",
    );
  if (new URL(request.url).search)
    throw new BffError(400, "INVALID_INPUT", "This receipt could not be read.");
  return { id: valid, authorization: `Deletion ${parsed[2]}` };
}
