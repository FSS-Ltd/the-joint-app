import { expect, it } from "vitest";
import { NativeApiError } from "../apps/mobile/src/api/errors.js";
import { sourceExports } from "./fixtures/native-source-harness.js";
const { financeErrorMessage, financeRecovery } = sourceExports(
  "apps/mobile/src/features/finance/errors.ts",
  { "../../api/errors": { NativeApiError } },
);
if (
  typeof financeErrorMessage !== "function" ||
  typeof financeRecovery !== "function"
)
  throw Error("Expected finance recovery exports");

it("routes rejected financial input to explicit correction and a fresh read", () => {
  const error = new NativeApiError(400, "INVALID_INPUT");
  expect(financeRecovery(error)).toBe("reload");
  expect(financeErrorMessage(error)).toMatch(/correct|check.*details/i);
  expect(financeErrorMessage(error)).not.toMatch(/connection/);
});

it("preserves uncertain, network, MFA and version recovery distinctions", () => {
  expect(
    financeRecovery(new NativeApiError(400, "INVALID_INPUT", "uncertain")),
  ).toBe("retry");
  expect(
    financeErrorMessage(new NativeApiError(400, "INVALID_INPUT", "uncertain")),
  ).toMatch(/may have been saved/);
  for (const status of [0, 503])
    expect(financeRecovery(new NativeApiError(status))).toBe("retry");
  for (const code of ["MFA_REQUIRED", "MFA_REAUTH_REQUIRED"])
    expect(financeRecovery(new NativeApiError(403, code))).toBe("security");
  expect(financeRecovery(new NativeApiError(409, "VERSION_CONFLICT"))).toBe(
    "reload",
  );
  expect(financeRecovery(new NativeApiError(503, "INVALID_INPUT"))).toBe(
    "retry",
  );
});
