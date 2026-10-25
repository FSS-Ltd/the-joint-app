import { expect, it } from "vitest";
import { isRetryableStatusError } from "../apps/web/components/events/status-subscription.js";
import { RequestError } from "../apps/web/components/identity/client.js";

it.each([
  [0, true],
  [408, true],
  [429, true],
  [500, true],
  [503, true],
  [400, false],
  [401, false],
  [403, false],
  [404, false],
  [409, false],
] as const)(
  "classifies HTTP %i consistently for recovery",
  (status, expected) => {
    expect(
      isRetryableStatusError(new RequestError("Safe message", status)),
    ).toBe(expected);
  },
);

it("never treats an unverified protocol or unknown failure as retryable", () => {
  expect(
    isRetryableStatusError(
      new RequestError("Safe message", 502, "INVALID_STATUS_STREAM"),
    ),
  ).toBe(false);
  expect(isRetryableStatusError(new Error("Unknown failure"))).toBe(false);
});
