import type { ReactNode } from "react";
import { RequestError } from "../identity/client";
import { Feedback } from "../identity/frame";

export function MutationFeedback({
  error,
  success,
  reload,
}: {
  error: unknown;
  success?: string;
  reload?: () => void;
}): ReactNode {
  const message =
    error instanceof Error
      ? error.message
      : error
        ? "This request could not be completed."
        : undefined;
  const reauth =
    error instanceof RequestError &&
    ["MFA_REQUIRED", "MFA_REAUTH_REQUIRED"].includes(error.code ?? "");
  return (
    <>
      <Feedback error={message} success={success} />
      {reauth && (
        <a className="button secondary" href="/security?reauth=1&next=accounts">
          Verify, then return to accounts
        </a>
      )}
      {error instanceof RequestError && error.status === 409 && reload && (
        <button className="text-button" type="button" onClick={reload}>
          Reload account
        </button>
      )}
    </>
  );
}
