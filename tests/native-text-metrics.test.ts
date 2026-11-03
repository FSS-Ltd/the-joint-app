import { expect, it } from "vitest";
import { sourceExports } from "./fixtures/native-source-harness.js";

// Keep React Native ambient types isolated from the server test compilation.
type MetricsHook = () => Record<string, number>;

function metrics(platform: "ios" | "android", fontScale: number) {
  const exports = sourceExports(
    "apps/mobile/src/components/use-native-text-metrics.ts",
    {
      "react-native": {
        Platform: { OS: platform },
        useWindowDimensions: () => ({ width: 390, fontScale }),
      },
    },
  );
  return (exports.useNativeTextMetrics as MetricsHook)();
}

it("keeps the approved default native type sizes", () => {
  expect(metrics("ios", 1)).toMatchObject({
    fontSize: 16,
    fieldLineHeight: 24,
    actionLineHeight: 20,
  });
});

it("enlarges fixed SwiftUI field and action text without capping accessibility sizes", () => {
  expect(metrics("ios", 2.5)).toMatchObject({
    fontSize: 40,
    fieldLineHeight: 60,
    actionLineHeight: 50,
    fontScale: 2.5,
  });
});

it("leaves Android sp scaling to Compose instead of multiplying it twice", () => {
  expect(metrics("android", 2.5)).toMatchObject({
    fontSize: 16,
    fieldLineHeight: 24,
    actionLineHeight: 20,
    fontScale: 2.5,
  });
});
