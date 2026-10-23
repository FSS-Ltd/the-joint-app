import { z } from "zod";
import { isSupportedFinancialText } from "./financial-input.js";
import { goalDtoSchema } from "./goals.js";
import { timestampSchema } from "./projection-primitives.js";

export const goalWriteSchema = goalDtoSchema
  .omit({
    schema: true,
    schemaVersion: true,
    id: true,
    householdId: true,
    version: true,
  })
  .extend({ name: goalDtoSchema.shape.name.refine(isSupportedFinancialText) });
export type GoalWrite = z.infer<typeof goalWriteSchema>;
export const goalPageQuerySchema = z
  .object({ cursor: z.string().min(1).max(4096).optional() })
  .strict();
export const goalListQuerySchema = goalPageQuerySchema;
export const goalRevisionPageSchema = z
  .object({
    goal: goalDtoSchema,
    revisions: z
      .array(
        z.object({ goal: goalDtoSchema, createdAt: timestampSchema }).strict(),
      )
      .max(50),
    nextAfterVersion: z.number().int().positive().max(2147483647).nullable(),
  })
  .strict();
export const goalRevisionListSchema = z
  .object({
    goals: z.array(goalDtoSchema).max(50),
    nextAfterId: z.uuid().nullable(),
  })
  .strict();
export const goalPageDtoSchema = goalRevisionPageSchema
  .omit({ nextAfterVersion: true })
  .extend({ nextCursor: z.string().max(4096).nullable() });
export const goalListDtoSchema = goalRevisionListSchema
  .omit({ nextAfterId: true })
  .extend({ nextCursor: z.string().max(4096).nullable() });
export type GoalPageDto = z.infer<typeof goalPageDtoSchema>;
export type GoalListDto = z.infer<typeof goalListDtoSchema>;
