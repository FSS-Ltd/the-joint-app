import { expect, it } from "vitest";
import {
  sessionActivitySchema,
  sessionDeadlineSchema,
} from "../packages/contracts/src/session-activity.js";

it("accepts bounded activity age and rejects extra fields or clock claims", () => {
  expect(sessionActivitySchema.parse({ activityAgeMs: 0 })).toEqual({
    activityAgeMs: 0,
  });
  for (const value of [
    { activityAgeMs: -1 },
    { activityAgeMs: 5001 },
    { activityAgeMs: 0.5 },
    { activityAgeMs: 0, sessionId: "other" },
    { activityAgeMs: "0" },
  ])
    expect(sessionActivitySchema.safeParse(value).success).toBe(false);
});
it("deadline responses contain only validated timestamps", () => {
  expect(
    sessionDeadlineSchema.safeParse({ expiresAt: "bad", serverTime: "bad" })
      .success,
  ).toBe(false);
  expect(
    sessionDeadlineSchema.safeParse({
      expiresAt: new Date().toISOString(),
      serverTime: new Date().toISOString(),
      token: "private",
    }).success,
  ).toBe(false);
});
