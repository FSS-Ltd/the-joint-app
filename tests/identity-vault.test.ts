import { randomBytes } from "node:crypto";
import { expect, it } from "vitest";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";

it("encrypts token sets and binds ciphertext to the intended session", () => {
  const vault = new IdentityVault(
    randomBytes(32).toString("base64"),
    randomBytes(32).toString("base64"),
  );
  const secret = "synthetic-refresh-secret";
  const sealed = vault.seal(secret, "session-a");
  expect(sealed).not.toContain(secret);
  expect(vault.open(sealed, "session-a")).toBe(secret);
  expect(() => vault.open(sealed, "session-b")).toThrow(
    "Stored identity data unavailable",
  );
  expect(() => vault.open(`${sealed.slice(0, -4)}AAAA`, "session-a")).toThrow(
    "Stored identity data unavailable",
  );
  expect(vault.seal(secret, "session-a")).not.toBe(sealed);
});
it("normalises verified email hashes without storing the email", () => {
  const vault = new IdentityVault(
    randomBytes(32).toString("base64"),
    randomBytes(32).toString("base64"),
  );
  expect(vault.emailHash(" Adult@Example.test ")).toBe(
    vault.emailHash("adult@example.test"),
  );
  expect(vault.emailHash("adult@example.test")).toMatch(/^[a-f0-9]{64}$/);
  expect(vault.emailHash("adult@example.test")).not.toBe(
    vault.emailHash("other@example.test"),
  );
});
