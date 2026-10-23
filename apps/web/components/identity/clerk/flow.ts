export type ClerkStage =
  | { step: "credentials" }
  | { step: "email"; kind: "signup" | "device" | "recovery" }
  | { step: "mfa" }
  | { step: "password" }
  | { step: "complete" };

export class ClerkFlowFailure extends Error {}
export function shouldResumeAuthentication(
  mode: "sign-in" | "sign-up" | "recovery",
  id: string | undefined,
  status: string | null,
): boolean {
  return (
    Boolean(id) &&
    (mode === "sign-up"
      ? status === "missing_requirements"
      : [
          "needs_second_factor",
          "needs_client_trust",
          "needs_new_password",
        ].includes(status ?? ""))
  );
}
export function taskPath(
  key: string | undefined,
): "/security" | "/auth/task/password" | "/auth/complete" {
  if (key === undefined) return "/auth/complete";
  if (key === "setup-mfa") return "/security";
  if (key === "reset-password") return "/auth/task/password";
  throw new ClerkFlowFailure(
    "An unsupported account requirement needs attention. Check the development authentication settings.",
  );
}

export function clerkFlowError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
  switch (code) {
    case "form_code_incorrect":
      return "That code did not match. Check it and try again.";
    case "verification_expired":
    case "form_code_expired":
      return "That code has expired. Request a new code.";
    case "too_many_requests":
    case "rate_limit_exceeded":
      return "Wait a moment before trying again.";
    case "form_password_pwned":
      return "Choose a different password. This password has appeared in a known breach.";
    case "form_password_length_too_short":
      return "Choose a longer password.";
    case "form_password_incorrect":
    case "form_identifier_not_found":
      return "Check your email and password, then try again.";
    default:
      return "Sign-in could not be completed. Check your details or connection and try again.";
  }
}
export function checked(result: { error: unknown }): void {
  if (result.error) throw new ClerkFlowFailure(clerkFlowError(result.error));
}
export async function advanceSignIn(resource: {
  status: string;
  supportedSecondFactors: ReadonlyArray<{ strategy: string }>;
  mfa: { sendEmailCode(): Promise<{ error: unknown }> };
}): Promise<ClerkStage> {
  if (resource.status === "complete") return { step: "complete" };
  if (resource.status === "needs_new_password") return { step: "password" };
  if (
    resource.status === "needs_second_factor" &&
    resource.supportedSecondFactors.some((f) => f.strategy === "totp")
  )
    return { step: "mfa" };
  if (
    ["needs_client_trust", "needs_second_factor"].includes(resource.status) &&
    resource.supportedSecondFactors.some((f) => f.strategy === "email_code")
  ) {
    checked(await resource.mfa.sendEmailCode());
    return { step: "email", kind: "device" };
  }
  throw new ClerkFlowFailure(
    "An additional sign-in check is required. Retry sign-in or check the development authentication settings.",
  );
}
export async function advanceSignUp(resource: {
  status: string | null;
  unverifiedFields: ReadonlyArray<string>;
  missingFields: ReadonlyArray<string>;
  verifications: { sendEmailCode(): Promise<{ error: unknown }> };
}): Promise<ClerkStage> {
  if (resource.status === "complete") return { step: "complete" };
  if (resource.unverifiedFields.includes("email_address")) {
    checked(await resource.verifications.sendEmailCode());
    return { step: "email", kind: "signup" };
  }
  if (resource.missingFields.includes("password")) return { step: "password" };
  throw new ClerkFlowFailure(
    "Sign-up requires additional details. Check the development authentication settings.",
  );
}
