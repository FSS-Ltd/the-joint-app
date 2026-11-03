import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { nativeClerkHarness } from "./fixtures/native-clerk-harness.js";
import { sdkErrors } from "./fixtures/clerk-sdk.js";
import {
  checked,
  clerkFlowError,
} from "../packages/identity-runtime/src/clerk-flow.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each(["form_password_incorrect", "form_identifier_not_found"])(
  "maps installed native SDK %s to safe credential feedback",
  async (code) => {
    const fixture = await nativeClerkHarness();
    fixture.failures.set("/v1/client/sign_ins", 422);
    fixture.errorCodes.set("/v1/client/sign_ins", code);
    // Read-only bridge to the same maintained resource returned by useSignIn.
    const signIn = fixture.clerk.client.signIn.__internal_future as unknown as {
      password(params: {
        emailAddress: string;
        password: string;
      }): Promise<{ error: unknown }>;
    };
    const result = await signIn.password({
      emailAddress: "synthetic@example.test",
      password: "synthetic-not-a-real-password",
    });
    expect(sdkErrors.isClerkAPIResponseError(result.error)).toBe(true);
    expect(result.error).toMatchObject({
      code: "api_response_error",
      errors: [{ code }],
    });
    const message = "Check your email and password, then try again.";
    expect(clerkFlowError(result.error)).toBe(message);
    expect(() => checked(result)).toThrow(message);
  },
);
