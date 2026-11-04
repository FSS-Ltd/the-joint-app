import { expect, it } from "vitest";
import { createStatusDecoder } from "../apps/web/lib/server/status-protocol.js";
import * as contracts from "../packages/contracts/src/index.js";
import { statusPath } from "../apps/web/components/events/status-path.js";

it("decodes shared empty signals and never reports keepalives as changes", () => {
  const signals: contracts.StatusSignal[] = [];
  const decoder = contracts.createStatusDecoder((signal) =>
    signals.push(signal),
  );
  decoder.push(
    new TextEncoder().encode("event: change\ndata: {}\n\n: keepalive\n\n"),
  );
  decoder.finish();
  expect(signals).toEqual(["change"]);
});

it("validates selectors and serializes numeric limits and only defined fields", () => {
  const householdId = "e237d3d7-236f-4ec3-8454-c4e5504d397f";
  const selector = {
    kind: "accounts" as const,
    householdId,
    limit: 2,
    cursor: undefined,
  };
  expect(contracts.statusSubscriptionQuery(selector)).toBe(
    `kind=accounts&householdId=${householdId}&limit=2`,
  );
  expect(statusPath(selector)).toBe(
    `/api/events?kind=accounts&householdId=${householdId}&limit=2`,
  );
  expect(
    new URLSearchParams(
      contracts.statusSubscriptionQuery({ ...selector, cursor: "opaque+/=" }),
    ).get("cursor"),
  ).toBe("opaque+/=");
  expect(() =>
    contracts.statusSubscriptionQuery({ ...selector, limit: 201 }),
  ).toThrow();
  expect(() => statusPath({ ...selector, limit: 201 })).toThrow(
    "This status is unavailable.",
  );
});

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
