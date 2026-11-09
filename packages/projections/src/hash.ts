import { createHash } from "node:crypto";
import type { ProjectionInputV1 } from "@joint/contracts";

/**
 * Serializes value into canonical JSON string with recursively sorted keys.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return "[" + value.map((item) => canonicalJson(item)).join(",") + "]";
  }

  const record = value as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const entries: string[] = [];

  for (const key of sortedKeys) {
    const val = record[key];
    if (val !== undefined) {
      entries.push(`${JSON.stringify(key)}:${canonicalJson(val)}`);
    }
  }

  return "{" + entries.join(",") + "}";
}

/**
 * Computes deterministic SHA-256 hash of canonicalized projection input.
 */
export function hashProjectionInput(input: ProjectionInputV1): string {
  const json = canonicalJson(input);
  return createHash("sha256").update(json, "utf8").digest("hex");
}
