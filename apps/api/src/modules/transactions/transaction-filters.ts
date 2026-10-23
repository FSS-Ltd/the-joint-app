import type { transactionListQuerySchema } from "@joint/contracts";
import type { Prisma } from "@joint/database/client";
import { monthBounds } from "@joint/domain/cash-flow";
export type ActivityFilters = Pick<
  ReturnType<typeof transactionListQuerySchema.parse>,
  "month" | "search" | "category" | "uncategorized" | "classificationKind"
>;

export function transactionFilters(
  input: ActivityFilters,
): Prisma.TransactionWhereInput {
  const conditions: Prisma.TransactionWhereInput[] = [];
  if (input.month) {
    const range = monthBounds(input.month);
    conditions.push({
      bookedDate: {
        gte: new Date(range.start),
        lt: new Date(range.endExclusive),
      },
    });
  }
  if (input.search)
    conditions.push({
      OR: [
        { description: { contains: input.search, mode: "insensitive" } },
        {
          override: {
            merchant: { contains: input.search, mode: "insensitive" },
          },
        },
      ],
    });
  const parentConditions: Prisma.TransactionWhereInput[] = [];
  const splitConditions: Prisma.TransactionSplitWhereInput = {};
  const category = input.uncategorized ? null : input.category;
  if (category !== undefined) {
    const parentCategory: Prisma.TransactionWhereInput =
      category === null
        ? { OR: [{ override: null }, { override: { category: null } }] }
        : { override: { category } };
    splitConditions.category = category;
    parentConditions.push(parentCategory);
  }
  if (input.classificationKind) {
    const kind = input.classificationKind;
    const untyped = {
      OR: [{ override: null }, { override: { classificationKind: null } }],
    } satisfies Prisma.TransactionWhereInput;
    const cash = {
      account: { kind: { in: ["CURRENT", "SAVINGS", "CREDIT_CARD"] } },
    } satisfies Prisma.TransactionWhereInput;
    const parent: Prisma.TransactionWhereInput[] = [
      { override: { classificationKind: kind } },
    ];
    if (kind === "EXPENSE")
      parent.push({ AND: [untyped, cash, { amountMinor: { lt: 0n } }] });
    if (kind === "UNCLASSIFIED")
      parent.push({
        AND: [untyped, { OR: [{ amountMinor: { gte: 0n } }, { NOT: cash }] }],
      });
    splitConditions.classificationKind = kind;
    parentConditions.push({ OR: parent });
  }
  if (parentConditions.length)
    conditions.push({
      OR: [
        { splits: { some: splitConditions } },
        { AND: [{ splits: { none: {} } }, ...parentConditions] },
      ],
    });
  return { AND: conditions };
}
