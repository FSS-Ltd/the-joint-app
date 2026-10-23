import { describe, expect, it } from "vitest";
import {
  apiEnvironmentSchema,
  healthSchema,
  readEnvironment,
  workerEnvironmentSchema,
} from "../packages/contracts/src/index.js";
describe("public contracts and environment", () => {
  it("rejects details in a health response", () => {
    expect(
      healthSchema.safeParse({ status: "ok", password: "secret" }).success,
    ).toBe(false);
  });
  it("reports field names without secret values", () => {
    expect(() =>
      readEnvironment(apiEnvironmentSchema, {
        DATABASE_URL: "synthetic-secret",
        API_PORT: "70000",
      }),
    ).toThrow("Invalid environment fields: DATABASE_URL, API_PORT");
  });
  it("rejects non-Postgres URLs and unbounded timers", () => {
    expect(
      workerEnvironmentSchema.safeParse({
        DATABASE_URL: "https://example.com",
        WORKER_INTERVAL_MS: "0",
      }).success,
    ).toBe(false);
  });
  it("sets bounded defaults", () => {
    expect(
      readEnvironment(apiEnvironmentSchema, {
        DATABASE_URL: "postgresql://localhost/joint",
      }),
    ).toMatchObject({ API_PORT: 3001, DATABASE_TIMEOUT_MS: 2000 });
  });
});

it("rejects unsafe server endpoints without exposing configuration values", async () => {
  const { identityEnvironmentSchema, webEnvironmentSchema } =
    await import("../packages/contracts/src/index.js");
  for (const value of [
    "synthetic-secret",
    "http://remote.invalid/auth/v1",
    "https://user:secret@example.invalid/auth/v1",
    "https://example.invalid/auth/v1?secret=value",
  ]) {
    expect(() =>
      readEnvironment(identityEnvironmentSchema, { AUTH_ISSUER: value }),
    ).toThrow("Invalid environment fields: AUTH_ISSUER");
  }
  expect(readEnvironment(webEnvironmentSchema, {})).toEqual({
    API_BASE_URL: "http://127.0.0.1:3001",
  });
});

it("rejects partial identity settings and malformed encryption keys without their values", async () => {
  const { authServerEnvironmentSchema } =
    await import("../packages/contracts/src/index.js");
  expect(() =>
    readEnvironment(authServerEnvironmentSchema, {
      AUTH_ISSUER: "http://127.0.0.1:15421/auth/v1",
      SUPABASE_AUTH_URL: "http://127.0.0.1:15421/auth/v1",
      SUPABASE_PUBLISHABLE_KEY: "synthetic-public-provider-key",
      AUTH_TOKEN_KEY: "synthetic-secret-do-not-log",
      AUTH_EMAIL_HASH_KEY: "synthetic-second-secret",
    }),
  ).toThrow("Invalid environment fields: AUTH_TOKEN_KEY, AUTH_EMAIL_HASH_KEY");
});
