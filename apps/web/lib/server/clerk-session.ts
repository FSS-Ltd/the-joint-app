import {
  clerkServerEnvironmentSchema,
  clerkWebEnvironmentSchema,
  readAuthProvider,
  readEnvironment,
} from "@joint/contracts";
import { BffError } from "./responses";

function unavailable(): BffError {
  return new BffError(
    503,
    "UNAVAILABLE",
    "Sign-in is unavailable. Check local auth setup or retry shortly.",
  );
}
async function sdkToken(): Promise<string | null> {
  // Never invoke SDK keyless mode or create an instance when local configuration is absent.
  readEnvironment(clerkServerEnvironmentSchema, process.env);
  readEnvironment(clerkWebEnvironmentSchema, process.env);
  const { auth } = await import("@clerk/nextjs/server");
  return (await auth()).getToken();
}
export async function resolveClerkSessionToken(
  source: () => Promise<string | null> = sdkToken,
): Promise<string> {
  try {
    const token = await source();
    if (
      !token ||
      token.length > 16384 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
    )
      throw new BffError(
        401,
        "SIGN_IN_REQUIRED",
        "Please sign in to continue.",
      );
    return token;
  } catch (error) {
    if (error instanceof BffError) throw error;
    throw unavailable();
  }
}
export function sessionAuthorization(
  token: string,
  mode: "local" | "clerk" = readAuthProvider(process.env),
): string {
  if (
    mode === "clerk" &&
    token.length <= 16384 &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
  )
    return `Bearer ${token}`;
  if (mode === "local" && /^[A-Za-z0-9_-]{43}$/.test(token))
    return `Session ${token}`;
  throw new BffError(401, "SIGN_IN_REQUIRED", "Please sign in to continue.");
}
