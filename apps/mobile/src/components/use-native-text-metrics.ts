import { Platform, useWindowDimensions } from "react-native";

/** Expo UI's fixed-size SwiftUI fonts need scaling; Compose already uses sp. */
export function useNativeTextMetrics(): {
  fontSize: number;
  fieldLineHeight: number;
  actionLineHeight: number;
  fontScale: number;
  width: number;
} {
  const { fontScale, width } = useWindowDimensions();
  const scale = Platform.OS === "ios" ? fontScale : 1;
  return {
    fontSize: 16 * scale,
    fieldLineHeight: 24 * scale,
    actionLineHeight: 20 * scale,
    fontScale,
    width,
  };
}
