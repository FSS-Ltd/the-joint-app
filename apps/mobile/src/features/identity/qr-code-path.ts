import { create } from "qrcode";

/** Encode locally as horizontal runs, with a four-module quiet zone. */
export function createQrCodePath(
  value: string,
): { path: string; moduleCount: number } | null {
  try {
    const { modules } = create(value, { errorCorrectionLevel: "M" });
    const runs: string[] = [];
    for (let row = 0; row < modules.size; row++) {
      let column = 0;
      while (column < modules.size) {
        if (!modules.data[row * modules.size + column]) {
          column++;
          continue;
        }
        const start = column;
        while (
          column < modules.size &&
          modules.data[row * modules.size + column]
        )
          column++;
        const width = column - start;
        runs.push(`M${start + 4} ${row + 4}h${width}v1h-${width}z`);
      }
    }
    return { path: runs.join(""), moduleCount: modules.size + 8 };
  } catch {
    return null;
  }
}
