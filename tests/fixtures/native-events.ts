import * as contracts from "../../packages/contracts/src/index.js";
import * as errors from "../../apps/mobile/src/api/errors.js";
import { sourceExports } from "./native-source-harness.js";

const stream = sourceExports("apps/mobile/src/events/stream.ts", {
  "@joint/contracts": contracts,
  "../api/errors": errors,
});
const scope = sourceExports("apps/mobile/src/events/scope.ts", {
  "@joint/contracts": contracts,
});
const resource = sourceExports("apps/mobile/src/events/resource.ts", {
  "../api/errors": errors,
  "./scope": scope,
  "./stream": stream,
});
export const readNativeStatusStream =
  stream.readNativeStatusStream as typeof import("../../apps/mobile/src/events/stream.js").readNativeStatusStream;
export const NativeResourceController =
  resource.NativeResourceController as typeof import("../../apps/mobile/src/events/resource.js").NativeResourceController;
export { NativeApiError } from "../../apps/mobile/src/api/errors.js";
