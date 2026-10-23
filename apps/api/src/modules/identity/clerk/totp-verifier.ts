import { ServiceUnavailableException } from "@nestjs/common";
import {
  clerkTotpVerificationSchema,
  type ClerkServerEnvironment,
} from "@joint/contracts";
import {
  createClerkRequest,
  ClerkProviderRejected,
} from "./provider-request.js";

export interface ClerkTotpVerifier {
  verify(subject: string, code: string): Promise<boolean>;
}
export function createClerkTotpVerifier(
  environment: ClerkServerEnvironment,
): ClerkTotpVerifier {
  const request = createClerkRequest(environment);
  return {
    async verify(subject, code) {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        environment.CLERK_TIMEOUT_MS,
      );
      timer.unref();
      try {
        const deadline = new Promise<never>((_, reject) =>
          controller.signal.addEventListener(
            "abort",
            () => reject(new Error()),
            { once: true },
          ),
        );
        const result = await Promise.race([
          request(
            `/users/${encodeURIComponent(subject)}/verify_totp`,
            "POST",
            controller.signal,
            { code },
          ),
          deadline,
        ]);
        return clerkTotpVerificationSchema.safeParse(result).success;
      } catch (error) {
        if (error instanceof ClerkProviderRejected) return false;
        throw new ServiceUnavailableException(
          "Authenticator verification is unavailable.",
        );
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    },
  };
}
