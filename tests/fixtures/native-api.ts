import * as contracts from "../../packages/contracts/src/index.js";
import { sdkErrors } from "./clerk-sdk.js";
import { sourceExports } from "./native-source-harness.js";
import * as errors from "../../apps/mobile/src/api/errors.js";
import * as body from "../../apps/mobile/src/api/body.js";
import * as statusConnection from "../../apps/mobile/src/api/status-connection.js";
import * as lifetime from "../../apps/mobile/src/api/lifetime.js";
const csvRequest = sourceExports("apps/mobile/src/api/csv-request.ts", {
  "@joint/contracts": contracts,
  "./errors": errors,
});
const transport = sourceExports("apps/mobile/src/api/request.ts", {
  "@joint/contracts": contracts,
  "@clerk/expo": { isClerkAPIResponseError: sdkErrors.isClerkAPIResponseError },
  "./send": {
    nativeSend: (...args: Parameters<typeof fetch>) => fetch(...args),
  },
  "./csv-request": csvRequest,
  "./errors": errors,
  "./body": body,
  "./lifetime": lifetime,
  "./status-connection": statusConnection,
});
const api = sourceExports("apps/mobile/src/features/identity/api.ts", {
  "../../api/request": transport,
  "../../api/errors": errors,
  "@joint/contracts": contracts,
  "@clerk/expo": { isClerkAPIResponseError: sdkErrors.isClerkAPIResponseError },
});
// The authored adapter executes; only native module loading is replaced by its real public error predicate.
export const createIdentityApi =
  api.createIdentityApi as typeof import("../../apps/mobile/src/features/identity/api.js").createIdentityApi;
export const IdentityApiError =
  api.IdentityApiError as typeof import("../../apps/mobile/src/features/identity/api.js").IdentityApiError;

// Only the native module boundary is replaced; these exports execute authored source.
export const createNativeTransport =
  transport.createNativeTransport as typeof import("../../apps/mobile/src/api/request.js").createNativeTransport;
export { NativeApiError } from "../../apps/mobile/src/api/errors.js";

export const createIdentityApiFromTransport =
  api.createIdentityApiFromTransport as typeof import("../../apps/mobile/src/features/identity/api.js").createIdentityApiFromTransport;

const privacy = sourceExports("apps/mobile/src/api/privacy.ts", {
  "@joint/contracts": contracts,
});
export const createPrivacyApi =
  privacy.createPrivacyApi as typeof import("../../apps/mobile/src/api/privacy.js").createPrivacyApi;
