import { z } from "zod";

export const sessionActivitySchema = z.strictObject({
  activityAgeMs: z.number().int().min(0).max(5000),
});
export const sessionDeadlineSchema = z.strictObject({
  expiresAt: z.iso.datetime(),
  serverTime: z.iso.datetime(),
});
export type SessionDeadline = z.infer<typeof sessionDeadlineSchema>;
