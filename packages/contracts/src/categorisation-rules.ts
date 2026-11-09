import { z } from "zod";

export const categorisationRuleCreateSchema = z
  .object({
    merchantPattern: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(80),
    priority: z.number().int().min(1).max(1000).default(100),
    enabled: z.boolean().default(true),
  })
  .strict();
export type CategorisationRuleCreate = z.input<
  typeof categorisationRuleCreateSchema
>;

export const categorisationRuleUpdateSchema = z
  .object({
    merchantPattern: z.string().trim().min(1).max(120).optional(),
    category: z.string().trim().min(1).max(80).optional(),
    priority: z.number().int().min(1).max(1000).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();
export type CategorisationRuleUpdate = z.infer<
  typeof categorisationRuleUpdateSchema
>;

export const categorisationRuleSchema = z
  .object({
    id: z.uuid(),
    householdId: z.uuid(),
    authorMembershipId: z.uuid(),
    merchantPattern: z.string().min(1).max(120),
    category: z.string().min(1).max(80),
    priority: z.number().int(),
    enabled: z.boolean(),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type CategorisationRule = z.infer<typeof categorisationRuleSchema>;

export const categorisationRulesResponseSchema = z
  .object({
    rules: z.array(categorisationRuleSchema).max(200),
  })
  .strict();
export type CategorisationRulesResponse = z.infer<
  typeof categorisationRulesResponseSchema
>;
