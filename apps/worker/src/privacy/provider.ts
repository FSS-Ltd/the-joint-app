import {
  clerkServerEnvironmentSchema,
  privacyWorkerEnvironmentSchema,
  readAuthProvider,
  readEnvironment,
} from "@joint/contracts";
import { ClerkAuthAdmin } from "./clerk-auth-admin.js";
import { LocalAuthAdmin } from "./local-auth-admin.js";
import type { DeletionProvider } from "./deletion-provider.js";

export function createDeletionProvider(
  values: Record<string, string | undefined>,
): DeletionProvider | undefined {
  const mode = readAuthProvider(values);
  const legacy =
    values.PRIVACY_AUTH_URL === undefined &&
    values.PRIVACY_AUTH_ADMIN_KEY === undefined
      ? undefined
      : readEnvironment(privacyWorkerEnvironmentSchema, values);
  const local = legacy
    ? new LocalAuthAdmin(legacy.PRIVACY_AUTH_URL, legacy.PRIVACY_AUTH_ADMIN_KEY)
    : undefined;
  return mode === "clerk"
    ? new ClerkAuthAdmin(
        readEnvironment(clerkServerEnvironmentSchema, values),
        local,
      )
    : local;
}
