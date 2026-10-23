import { expect, it, vi } from "vitest";
import {
  advanceSignIn,
  advanceSignUp,
  clerkFlowError,
  taskPath,
  shouldResumeAuthentication,
} from "../apps/web/components/identity/clerk/flow.js";

it("never treats Device Trust as authenticator verification", async () => {
  const sendEmailCode = vi.fn(async () => ({ error: null }));
  const state = await advanceSignIn({
    status: "needs_client_trust",
    supportedSecondFactors: [{ strategy: "email_code" }],
    mfa: { sendEmailCode },
  });
  expect(state).toEqual({ step: "email", kind: "device" });
  expect(sendEmailCode).toHaveBeenCalledOnce();
});

it("does not resume an unstarted Clerk resource that defaults to missing requirements", () => {
  expect(
    shouldResumeAuthentication("sign-up", undefined, "missing_requirements"),
  ).toBe(false);
  expect(
    shouldResumeAuthentication(
      "sign-up",
      "su_synthetic",
      "missing_requirements",
    ),
  ).toBe(true);
  expect(
    shouldResumeAuthentication(
      "recovery",
      "si_synthetic",
      "needs_new_password",
    ),
  ).toBe(true);
  expect(
    shouldResumeAuthentication("sign-in", "si_synthetic", "needs_client_trust"),
  ).toBe(true);
});
it("routes TOTP challenges, password reset and completed sessions explicitly", async () => {
  const mfa = { sendEmailCode: vi.fn(async () => ({ error: null })) };
  expect(
    await advanceSignIn({
      status: "needs_second_factor",
      supportedSecondFactors: [{ strategy: "totp" }],
      mfa,
    }),
  ).toEqual({ step: "mfa" });
  expect(
    await advanceSignIn({
      status: "needs_new_password",
      supportedSecondFactors: [],
      mfa,
    }),
  ).toEqual({ step: "password" });
  expect(
    await advanceSignIn({
      status: "complete",
      supportedSecondFactors: [],
      mfa,
    }),
  ).toEqual({ step: "complete" });
});
it("sends sign-up verification only for an unverified email and does not pretend missing requirements are complete", async () => {
  const sendEmailCode = vi.fn(async () => ({ error: null }));
  expect(
    await advanceSignUp({
      status: "missing_requirements",
      unverifiedFields: ["email_address"],
      missingFields: [],
      verifications: { sendEmailCode },
    }),
  ).toEqual({ step: "email", kind: "signup" });
  expect(sendEmailCode).toHaveBeenCalledOnce();
  await expect(
    advanceSignUp({
      status: "missing_requirements",
      unverifiedFields: [],
      missingFields: ["first_name"],
      verifications: { sendEmailCode },
    }),
  ).rejects.toThrow("additional details");
});
it("fails safely when sending a code fails and never echoes provider secrets", async () => {
  await expect(
    advanceSignUp({
      status: "missing_requirements",
      unverifiedFields: ["email_address"],
      missingFields: [],
      verifications: {
        sendEmailCode: async () => ({
          error: { code: "too_many_requests", secret: "PRIVATE" },
        }),
      },
    }),
  ).rejects.toThrow("Wait");
  expect(clerkFlowError({ message: "PRIVATE", code: "unknown" })).not.toContain(
    "PRIVATE",
  );
  expect(clerkFlowError({ code: "form_code_incorrect" })).toContain("code");
  expect(clerkFlowError({ code: "verification_expired" })).toContain("expired");
});

it("routes mandatory tasks before the application and rejects unknown tasks", () => {
  expect(taskPath("setup-mfa")).toBe("/security");
  expect(taskPath("reset-password")).toBe("/auth/task/password");
  expect(taskPath(undefined)).toBe("/auth/complete");
  expect(() => taskPath("choose-organization")).toThrow("unsupported");
});
