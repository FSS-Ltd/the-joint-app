import { z } from "zod";

export const allocationAccountIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(50)
  .refine(
    (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
  );

export const allocationSourceVersionsSchema = z
  .array(
    z
      .object({
        accountId: z.uuid(),
        version: z.number().int().min(0).max(2147483647),
      })
      .strict(),
  )
  .min(1)
  .max(50);

export function matchesAllocationSources(
  ids: readonly string[],
  sources: readonly { accountId: string }[],
): boolean {
  const selected = new Set(ids.map((id) => id.toLowerCase()));
  const actual = new Set(
    sources.map((source) => source.accountId.toLowerCase()),
  );
  return (
    sources.length === ids.length &&
    actual.size === selected.size &&
    [...actual].every((id) => selected.has(id))
  );
}

export const allocationControlledScopeSchema = z
  .object({
    kind: z.literal("CONTROLLED"),
    accountIds: allocationAccountIdsSchema,
    sources: allocationSourceVersionsSchema,
  })
  .strict()
  .refine(
    ({ accountIds, sources }) =>
      accountIds.every(
        (id, index) =>
          id === id.toLowerCase() &&
          (index === 0 || accountIds[index - 1]! < id) &&
          sources[index]?.accountId === id,
      ) && matchesAllocationSources(accountIds, sources),
  );
