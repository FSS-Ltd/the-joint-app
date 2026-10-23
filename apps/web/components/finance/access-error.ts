import { RequestError } from "../identity/client";
export function isAccessError(error: unknown): boolean {
  return (
    error instanceof RequestError && [401, 403, 404].includes(error.status)
  );
}
