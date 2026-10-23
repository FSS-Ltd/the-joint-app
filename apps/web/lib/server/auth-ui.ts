import {
  clerkServerEnvironmentSchema,
  clerkWebEnvironmentSchema,
  readAuthProvider,
} from "@joint/contracts";

export type AuthUiConfiguration =
  | { provider: "local" }
  | { provider: "unavailable" }
  | { provider: "clerk"; publishableKey: string };
export function authUiConfiguration(
  environment: Record<string, string | undefined>,
): AuthUiConfiguration {
  try {
    if (readAuthProvider(environment) === "local") return { provider: "local" };
    const server = clerkServerEnvironmentSchema.safeParse(environment);
    const web = clerkWebEnvironmentSchema.safeParse(environment);
    return server.success && web.success
      ? {
          provider: "clerk",
          publishableKey: web.data.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        }
      : { provider: "unavailable" };
  } catch {
    return { provider: "unavailable" };
  }
}
