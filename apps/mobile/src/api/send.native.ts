import { fetch } from "expo/fetch";
import type { NativeSend } from "./types";

/** Expo's streaming response is required for device status subscriptions. */
export const nativeSend: NativeSend = fetch;
