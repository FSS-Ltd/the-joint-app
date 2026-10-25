import { expect, it } from "vitest";
import { createStatusDecoder } from "../apps/web/lib/server/status-protocol.js";

const bytes = (value: string) => new TextEncoder().encode(value);
it("preserves empty signals across arbitrary chunk boundaries and normalizes CRLF", () => {
  const decoder = createStatusDecoder();
  expect(decoder.push(bytes("event: cha"))).toBeNull();
  expect(
    new TextDecoder().decode(
      decoder.push(bytes("nge\r\ndata: {}\r\n\r\n: keepalive\n\n")) ??
        undefined,
    ),
  ).toBe("event: change\ndata: {}\n\n: keepalive\n\n");
  expect(() => decoder.finish()).not.toThrow();
});
it("rejects unknown events, nonempty data, extra fields, invalid UTF-8 and oversized partial frames without echoing content", () => {
  for (const value of [
    "event: other\ndata: {}\n\n",
    'event: change\ndata: {"secret":"private-sentinel"}\n\n',
    "event: change\ndata: {}\nid: private-sentinel\n\n",
    ": private-sentinel\n\n",
    "x".repeat(8193),
  ]) {
    const decoder = createStatusDecoder();
    expect(() => decoder.push(bytes(value))).toThrow();
    try {
      decoder.push(bytes(value));
    } catch (error) {
      expect(String(error)).not.toContain("private-sentinel");
    }
  }
  expect(() => createStatusDecoder().push(new Uint8Array([255]))).toThrow();
  const partial = createStatusDecoder();
  partial.push(bytes("event: change\n"));
  expect(() => partial.finish()).toThrow();
});
