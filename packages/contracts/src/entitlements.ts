import { z } from "zod";

export const entitlementCapabilitySchema = z.enum([
  "finance.manual",
  "projections.basic",
  "connections.bank",
  "connections.broker",
  "projections.advanced",
  "categorisation.automation",
  "insights.local",
]);
export type EntitlementCapability = z.infer<typeof entitlementCapabilitySchema>;
export const entitlementResponseSchema = z
  .object({
    plan: z.enum(["FREE", "PLUS"]),
    version: z.string().regex(/^[a-f0-9]{64}$/),
    capabilities: z.array(entitlementCapabilitySchema),
    caps: z
      .object({
        bankAuthorisations: z.number().int().min(0).max(4),
        brokerConnections: z.number().int().min(0).max(2),
        companionDevices: z.number().int().min(0).max(1),
      })
      .strict(),
    effectiveUntil: z.iso.datetime().nullable(),
  })
  .strict();
export type EntitlementResponse = z.infer<typeof entitlementResponseSchema>;
