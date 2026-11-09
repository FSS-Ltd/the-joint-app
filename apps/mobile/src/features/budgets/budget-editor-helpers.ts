import { categoryLabelSchema } from "@joint/contracts";
import { parseMoneyInput } from "@joint/domain";

export interface BudgetLineInput {
  category: string;
  amount: string;
}

/** Parse GBP decimal string to minor-unit string. Throws for invalid input. */
export function parseBudgetLine(amount: string): string {
  const money = parseMoneyInput(amount);
  if (BigInt(money.amountMinor) < 0n) {
    throw new Error("Amount must be non-negative.");
  }
  return money.amountMinor;
}

/** Format minor-unit amount as a GBP decimal string for display in input fields. */
export function formatLineAmount(amountMinor: string): string {
  const raw = BigInt(amountMinor);
  const abs = raw < 0n ? -raw : raw;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${raw < 0n ? "-" : ""}${whole}.${frac}`;
}

/**
 * Validate all budget lines before submission.
 * Returns an error message string when invalid, or null when valid.
 * Lines with empty amounts are skipped (not submitted) and excluded from
 * uniqueness checks.
 */
export function validateBudgetLines(lines: BudgetLineInput[]): string | null {
  const active = lines.filter((l) => l.amount.trim() !== "");

  if (active.length > 100) {
    return "A monthly budget can include at most 100 category limits.";
  }

  for (const line of active) {
    const category = line.category.trim() || null;
    if (!categoryLabelSchema.safeParse(category).success) {
      return "Enter a category name of up to 80 characters without control characters.";
    }
    try {
      parseBudgetLine(line.amount);
    } catch {
      return "Use one non-negative GBP limit per category, with at most two decimal places.";
    }
  }

  // Treat empty-string category as "Uncategorized" for uniqueness purposes.
  const categories = active.map((l) => l.category.trim() || null);
  const unique = new Set(categories.map((c) => JSON.stringify(c)));
  if (unique.size !== categories.length) {
    return "Each category can only appear once. Remove the duplicate category line.";
  }

  return null;
}

/** Build the lines payload for PUT /budgets/:month. Skips lines with empty amounts. */
export function buildBudgetPayload(
  lines: BudgetLineInput[],
  accountIds: string[],
): {
  accountIds: string[];
  lines: {
    category: string | null;
    limit: { amountMinor: string; currency: "GBP" };
  }[];
} {
  return {
    accountIds,
    lines: lines
      .filter((l) => l.amount.trim() !== "")
      .map((l) => ({
        category: l.category.trim() || null,
        limit: {
          amountMinor: parseBudgetLine(l.amount),
          currency: "GBP" as const,
        },
      })),
  };
}
