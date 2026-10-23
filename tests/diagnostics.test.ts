import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { diagnosticLine } from "../packages/database/src/diagnostics.js";

it("serializes correlation only and drops secrets, financial payload and exception details", () => {
  const requestId = randomUUID();
  const sentinel = "SYNTHETIC_SECRET_TOKEN_AND_FINANCIAL_PAYLOAD";
  const line = diagnosticLine({
    code: "API_REQUEST_REJECTED",
    requestId,
    status: 503,
    authorization: sentinel,
    cookie: sentinel,
    body: { note: sentinel },
    error: new Error(sentinel),
  });
  expect(JSON.parse(line)).toEqual({
    code: "API_REQUEST_REJECTED",
    requestId,
    status: 503,
  });
  expect(line).not.toContain(sentinel);
  expect(
    diagnosticLine({ code: sentinel, jobId: sentinel, status: sentinel }),
  ).toBe('{"code":"UNAVAILABLE"}\n');
});
