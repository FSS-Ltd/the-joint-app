import * as contracts from "../../packages/contracts/src/index.js";
import { sdkErrors } from "./clerk-sdk.js";
import { sourceExports } from "./native-source-harness.js";
const api = sourceExports("apps/mobile/src/features/identity/api.ts", {
  "@joint/contracts": contracts,
  "@clerk/expo": { isClerkAPIResponseError: sdkErrors.isClerkAPIResponseError },
});
// The authored adapter executes; only native module loading is replaced by its real public error predicate.
export const createIdentityApi =
  api.createIdentityApi as typeof import("../../apps/mobile/src/features/identity/api.js").createIdentityApi;
export const IdentityApiError =
  api.IdentityApiError as typeof import("../../apps/mobile/src/features/identity/api.js").IdentityApiError;
