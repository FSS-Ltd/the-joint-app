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
  .object({
    afterVersion: z
      .string()
      .regex(/^(0|[1-9]\d{0,9})$/)
      .transform(Number)
      .pipe(z.number().int().max(2147483647))
      .optional()
      .default(0),
  })
  .strict();
export const goalListQuerySchema = z
  .object({ afterId: z.uuid().optional() })
  .strict();
export const goalPageDtoSchema = z
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
export const goalListDtoSchema = z
  .object({
    goals: z.array(goalDtoSchema).max(50),
    nextAfterId: z.uuid().nullable(),
  })
  .strict();
export type GoalPageDto = z.infer<typeof goalPageDtoSchema>;
export type GoalListDto = z.infer<typeof goalListDtoSchema>;
