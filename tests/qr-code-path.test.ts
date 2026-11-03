import { expect, it } from "vitest";
import { sourceExports } from "./fixtures/native-source-harness.js";
import { createQrCodePath } from "../apps/mobile/src/features/identity/qr-code-path.js";

type QrPath = { path: string; moduleCount: number } | null;
function encoder(create: (value: string, options: unknown) => unknown) {
  return sourceExports("apps/mobile/src/features/identity/qr-code-path.ts", {
    qrcode: { create },
  }).createQrCodePath as (value: string) => QrPath;
}

it("merges adjacent dark modules and leaves four clear modules on every edge", () => {
  const path = encoder((value, options) => {
    expect(value).toBe("synthetic QR payload");
    expect(options).toEqual({ errorCorrectionLevel: "M" });
    return {
      modules: { size: 3, data: new Uint8Array([1, 1, 0, 0, 1, 0, 1, 1, 1]) },
    };
  })("synthetic QR payload");
  expect(path).toEqual({
    moduleCount: 11,
    path: "M4 4h2v1h-2zM5 5h1v1h-1zM4 6h3v1h-3z",
  });
});

it("returns a manual-fallback signal when encoding fails", () => {
  expect(
    encoder(() => {
      throw new Error("synthetic encoder failure");
    })("synthetic QR payload"),
  ).toBeNull();
});

it("encodes with the installed public encoder and bounds all runs inside the quiet zone", () => {
  const result = createQrCodePath("A");
  expect(result?.moduleCount).toBe(29);
  expect(result?.path.startsWith("M4 4h7v1h-7z")).toBe(true);
  const runs = [
    ...(result?.path ?? "").matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g),
  ];
  expect(runs.length).toBeGreaterThan(0);
  for (const run of runs) {
    const left = Number(run[1]),
      top = Number(run[2]),
      width = Number(run[3]);
    expect(left).toBeGreaterThanOrEqual(4);
    expect(top).toBeGreaterThanOrEqual(4);
    expect(left + width).toBeLessThanOrEqual(25);
    expect(top + 1).toBeLessThanOrEqual(25);
  }
  expect(createQrCodePath("x".repeat(10000))).toBeNull();
});
