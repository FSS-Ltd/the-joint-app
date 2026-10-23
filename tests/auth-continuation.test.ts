import { expect, it } from "vitest";
import {
  authContinuation,
  readAuthDestination,
} from "../apps/web/lib/auth-continuation.js";

it.each(["archive", "privacy", "join", "accounts"])(
  "retains the allowlisted %s destination across every authentication transition",
  (next) => {
    for (const path of [
      "/sign-in",
      "/sign-up",
      "/recovery",
      "/security",
      "/auth/complete",
      "/auth/callback",
      "/auth/task/password",
    ] as const) {
      expect(authContinuation(path, `?next=${next}`)).toBe(
        `${path}?next=${next}`,
      );
    }
  },
);
it("drops unknown destinations and unrelated provider/query values", () => {
  expect(
    authContinuation(
      "/sign-in",
      "?next=https%3A%2F%2Fforeign.example.test&code=PRIVATE_SENTINEL",
    ),
  ).toBe("/sign-in");
  expect(
    authContinuation("/recovery", "?next=privacy&code=PRIVATE_SENTINEL"),
  ).toBe("/recovery?next=privacy");
  expect(readAuthDestination("?next=privacy")).toBe("/settings/privacy");
  expect(readAuthDestination("")).toBe("/household");
});
