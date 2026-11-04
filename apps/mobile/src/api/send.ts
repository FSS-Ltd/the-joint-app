import type { NativeSend } from "./types";

/** Standards-based fallback for non-native tooling; Metro selects send.native on devices. */
export const nativeSend: NativeSend = (url, options) => fetch(url, options);
