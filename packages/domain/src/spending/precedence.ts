export interface CategorisationRuleItem {
  id: string;
  priority: number;
  enabled: boolean;
  merchantPattern: string;
  category: string;
}

export interface CategorisationPrecedenceInput {
  overrideCategory?: string | null;
  hasExplicitOverride?: boolean;
  rules: readonly CategorisationRuleItem[];
  providerCategory?: string | null;
  description: string;
  merchant?: string | null;
}

export type CategoryResolutionSource =
  "MANUAL_OVERRIDE" | "OWNER_RULE" | "PROVIDER" | "UNCATEGORIZED";

export interface CategoryResolutionResult {
  category: string | null;
  source: CategoryResolutionSource;
  ruleId?: string;
}

/**
 * Normalises a merchant name or pattern for comparison.
 */
export function normalisePattern(pattern: string): string {
  return pattern
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Checks if a rule matches a transaction's merchant or description.
 */
export function matchesRule(
  rule: CategorisationRuleItem,
  description: string,
  merchant?: string | null,
): boolean {
  if (!rule.enabled) return false;
  const targetPattern = normalisePattern(rule.merchantPattern);
  if (!targetPattern) return false;

  const descNorm = normalisePattern(description);
  const merchantNorm = merchant ? normalisePattern(merchant) : "";

  return (
    descNorm.includes(targetPattern) ||
    (merchantNorm.length > 0 && merchantNorm.includes(targetPattern))
  );
}

/**
 * Resolves category following authoritative precedence:
 * 1. Explicit owner override (TransactionOverride).
 * 2. Highest-priority enabled owner rule (CategorisationRule).
 * 3. Mapped provider category with provenance.
 * 4. Uncategorized (null).
 */
export function resolveCategoryPrecedence(
  input: CategorisationPrecedenceInput,
): CategoryResolutionResult {
  // 1. Explicit manual override (when hasExplicitOverride is true, or overrideCategory is non-null)
  if (
    input.hasExplicitOverride ||
    (input.overrideCategory !== undefined && input.overrideCategory !== null)
  ) {
    return {
      category: input.overrideCategory ?? null,
      source: "MANUAL_OVERRIDE",
    };
  }

  // 2. Highest-priority enabled owner rule
  // Lower priority number = higher precedence (e.g. priority 10 before priority 50)
  const sortedRules = [...input.rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (matchesRule(rule, input.description, input.merchant)) {
      return {
        category: rule.category,
        source: "OWNER_RULE",
        ruleId: rule.id,
      };
    }
  }

  // 3. Provider category with provenance
  if (input.providerCategory && input.providerCategory.trim().length > 0) {
    return {
      category: input.providerCategory.trim(),
      source: "PROVIDER",
    };
  }

  // 4. Fallback to uncategorized
  return {
    category: null,
    source: "UNCATEGORIZED",
  };
}
