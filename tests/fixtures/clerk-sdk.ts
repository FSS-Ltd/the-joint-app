import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
const appRequire = createRequire(resolve("apps/mobile/package.json"));
const expoRequire = createRequire(
  appRequire.resolve("@clerk/expo/package.json"),
);
const sdkEntry = expoRequire.resolve("@clerk/clerk-js");
const sdkRequire = createRequire(sdkEntry);
// Load the installed native bundle and public error module, never rewrite SDK algorithms.
export const nativeSdkPath = join(dirname(sdkEntry), "clerk.native.js");
export const sdkErrors = sdkRequire(
  "@clerk/shared/errors/clerkApiResponseError",
) as {
  ClerkAPIResponseError: new (
    message: string,
    options: { status: number; data: { code: string; message: string }[] },
  ) => Error & { status: number };
  isClerkAPIResponseError(error: unknown): error is Error & { status: number };
};
export function providerError(status: number): Error & { status: number } {
  return new sdkErrors.ClerkAPIResponseError("private provider detail", {
    status,
    data: [{ code: "session_not_found", message: "private provider detail" }],
  });
}

export type SdkSession = {
  id: string;
  status: string;
  user: { id: string };
  currentTask?: { key: string };
  remove(): Promise<SdkSession>;
  touch(): Promise<SdkSession>;
  getToken(options?: { skipCache: boolean }): Promise<string | null>;
};
export type NativeClerk = {
  session: SdkSession | null | undefined;
  client: {
    sessions: SdkSession[];
    signedInSessions: SdkSession[];
    reload(): Promise<unknown>;
  };
  load(options: {
    standardBrowser: false;
    telemetry: false;
    polling: false;
  }): Promise<void>;
  setActive(options: {
    session: string | null;
    navigate?: () => void;
  }): Promise<void>;
  addListener(
    listener: (event: { session: SdkSession | null | undefined }) => void,
  ): () => void;
};
// Assert only the fixture boundary's documented API surface, not SDK internals.
export const Clerk = expoRequire(nativeSdkPath).Clerk as new (
  key: string,
) => NativeClerk;
export const testPublishableKey =
  "pk_test_" + Buffer.from("synthetic.clerk.accounts.dev$").toString("base64");
