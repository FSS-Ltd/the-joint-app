import { calculateProjection } from "@joint/projections";

export interface DecryptedAccountEvidence {
  accountId: string;
  name: string;
  permission: "TOTALS" | "TRANSACTIONS";
  currency: string;
  balances: { amount: string; asOfDate: string }[];
  transactions: {
    id: string;
    amount: string;
    description: string;
    bookedAt: string;
    categoryId?: string;
  }[];
}

export interface DecryptedEvidencePayload {
  jobId: string;
  audienceScope: "PERSONAL" | "HOUSEHOLD";
  grantVersion: number;
  accounts: DecryptedAccountEvidence[];
  timestamp: string;
}

export interface SpendSummaryInput {
  categoryIds?: string[];
  startDate?: string;
  endDate?: string;
}

export interface SpendSummaryResult {
  totalSpentMinor: string;
  transactionCount: number;
  categories: {
    categoryId: string;
    totalMinor: string;
    count: number;
  }[];
  dateRange: {
    from: string | null;
    to: string | null;
  };
}

export interface RecurringCostsInput {
  lookbackMonths?: number;
}

export interface RecurringCostItem {
  description: string;
  intervalDays: number;
  estimatedMonthlyMinor: string;
  occurrenceCount: number;
  uncertainty: "LOW" | "MEDIUM" | "HIGH";
}

export interface RecurringCostsResult {
  recurringCount: number;
  totalMonthlyEstimatedMinor: string;
  items: RecurringCostItem[];
}

export interface ProjectGoalInput {
  currentSavingsMinor: string;
  monthlyContributionMinor: string;
  targetAmountMinor: string;
  annualRateBps?: number;
  horizonMonths?: number;
}

export interface ProjectGoalResult {
  projectedMonths: number;
  isFeasible: boolean;
  projectedFinalBalanceMinor: string;
  targetDateEstimate: string | null;
}

export interface CompareScenariosInput {
  baseline: ProjectGoalInput;
  alternative: ProjectGoalInput;
}

export interface CompareScenariosResult {
  monthsDifference: number;
  contributionDifferenceMinor: string;
  baselineMonths: number;
  alternativeMonths: number;
}

function getMonthEndDate(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1; // 1-12
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

export class ToolGateway {
  private roundCount = 0;
  private readonly maxRounds = 4;

  constructor(private readonly evidence: DecryptedEvidencePayload) {}

  getRoundCount(): number {
    return this.roundCount;
  }

  private incrementRound(): void {
    this.roundCount++;
    if (this.roundCount > this.maxRounds) {
      throw new Error(
        `Tool execution exceeded maximum round limit of ${this.maxRounds}.`,
      );
    }
  }

  getSpendSummary(input: SpendSummaryInput = {}): SpendSummaryResult {
    this.incrementRound();

    let totalSpent = 0n;
    let txCount = 0;
    const categoryTotals = new Map<string, { total: bigint; count: number }>();
    let minDate: string | null = null;
    let maxDate: string | null = null;

    for (const acc of this.evidence.accounts) {
      if (acc.permission !== "TRANSACTIONS") {
        continue;
      }

      for (const tx of acc.transactions) {
        if (input.startDate && tx.bookedAt < input.startDate) continue;
        if (input.endDate && tx.bookedAt > input.endDate) continue;

        const catId = tx.categoryId || "uncategorized";
        if (input.categoryIds && input.categoryIds.length > 0) {
          if (!input.categoryIds.includes(catId)) continue;
        }

        const amt = BigInt(tx.amount);
        // In the finance model, negative amounts represent debits / spending
        if (amt < 0n) {
          const spend = -amt;
          totalSpent += spend;
          txCount++;

          const existing = categoryTotals.get(catId) || { total: 0n, count: 0 };
          categoryTotals.set(catId, {
            total: existing.total + spend,
            count: existing.count + 1,
          });

          if (!minDate || tx.bookedAt < minDate) minDate = tx.bookedAt;
          if (!maxDate || tx.bookedAt > maxDate) maxDate = tx.bookedAt;
        }
      }
    }

    const categories = Array.from(categoryTotals.entries())
      .map(([categoryId, data]) => ({
        categoryId,
        totalMinor: data.total.toString(),
        count: data.count,
      }))
      .sort((a, b) => a.categoryId.localeCompare(b.categoryId));

    return {
      totalSpentMinor: totalSpent.toString(),
      transactionCount: txCount,
      categories,
      dateRange: { from: minDate, to: maxDate },
    };
  }

  getRecurringCosts(input: RecurringCostsInput = {}): RecurringCostsResult {
    this.incrementRound();

    const lookback = input.lookbackMonths ?? 3;
    const refTime = new Date(this.evidence.timestamp).getTime();
    const cutoff = new Date(
      refTime - lookback * 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Group debits by normalized description
    const groups = new Map<string, { amounts: bigint[]; dates: string[] }>();

    for (const acc of this.evidence.accounts) {
      if (acc.permission !== "TRANSACTIONS") continue;

      for (const tx of acc.transactions) {
        if (tx.bookedAt < cutoff) continue;
        const amt = BigInt(tx.amount);
        if (amt < 0n) {
          const normDesc = tx.description.trim().toLowerCase();
          const existing = groups.get(normDesc) || { amounts: [], dates: [] };
          existing.amounts.push(-amt);
          existing.dates.push(tx.bookedAt);
          groups.set(normDesc, existing);
        }
      }
    }

    const items: RecurringCostItem[] = [];
    let totalMonthly = 0n;

    for (const [desc, data] of groups.entries()) {
      if (data.amounts.length >= 2) {
        data.dates.sort();
        // Calculate average interval in days
        let totalIntervalDays = 0;
        for (let i = 1; i < data.dates.length; i++) {
          const diffMs =
            new Date(data.dates[i]!).getTime() -
            new Date(data.dates[i - 1]!).getTime();
          totalIntervalDays += diffMs / (24 * 60 * 60 * 1000);
        }
        const avgInterval = Math.round(
          totalIntervalDays / (data.dates.length - 1),
        );

        // Average amount
        const sum = data.amounts.reduce((a, b) => a + b, 0n);
        const avgAmount = sum / BigInt(data.amounts.length);

        // Normalize to monthly
        let monthlyEst = avgAmount;
        if (avgInterval >= 6 && avgInterval <= 8) {
          // Weekly -> monthly approx * 4.33
          monthlyEst = (avgAmount * 433n) / 100n;
        } else if (avgInterval >= 13 && avgInterval <= 16) {
          // Bi-weekly
          monthlyEst = (avgAmount * 217n) / 100n;
        }

        totalMonthly += monthlyEst;

        const uncertainty: "LOW" | "MEDIUM" | "HIGH" =
          data.amounts.length >= 3 ? "LOW" : "MEDIUM";

        items.push({
          description: desc,
          intervalDays: avgInterval,
          estimatedMonthlyMinor: monthlyEst.toString(),
          occurrenceCount: data.amounts.length,
          uncertainty,
        });
      }
    }

    items.sort((a, b) => a.description.localeCompare(b.description));

    return {
      recurringCount: items.length,
      totalMonthlyEstimatedMinor: totalMonthly.toString(),
      items,
    };
  }

  projectGoal(input: ProjectGoalInput): ProjectGoalResult {
    this.incrementRound();
    return this.calculateProjectGoal(input);
  }

  private calculateProjectGoal(input: ProjectGoalInput): ProjectGoalResult {
    const referenceDate = new Date(this.evidence.timestamp);
    const firstContributionDate = getMonthEndDate(referenceDate);
    const horizon = input.horizonMonths ?? 120; // 10 years default cap
    const isBasic = !input.annualRateBps || input.annualRateBps === 0;

    const currentSavingsMinor = String(input.currentSavingsMinor || "0");
    const monthlyContributionMinor = String(
      input.monthlyContributionMinor || "0",
    );
    const targetAmountMinor = String(input.targetAmountMinor || "0");

    const monthlyContributions = [
      {
        fromMonth: 1,
        amount: {
          amountMinor: monthlyContributionMinor,
          currency: "GBP" as const,
        },
      },
    ];

    const projectionInput = isBasic
      ? {
          schema: "projection-input" as const,
          schemaVersion: 1 as const,
          mode: "BASIC" as const,
          targetBasis: "FIXED_NOMINAL" as const,
          opening: {
            amountMinor: currentSavingsMinor,
            currency: "GBP" as const,
          },
          target: {
            amountMinor: targetAmountMinor,
            currency: "GBP" as const,
          },
          firstContributionDate,
          horizonMonths: horizon,
          monthlyContributions,
        }
      : {
          schema: "projection-input" as const,
          schemaVersion: 1 as const,
          mode: "ADVANCED" as const,
          scenarioId: "00000000-0000-0000-0000-000000000000",
          targetBasis: "FIXED_NOMINAL" as const,
          opening: {
            amountMinor: currentSavingsMinor,
            currency: "GBP" as const,
          },
          target: {
            amountMinor: targetAmountMinor,
            currency: "GBP" as const,
          },
          firstContributionDate,
          horizonMonths: horizon,
          monthlyContributions,
          withdrawals: [],
          fixedFees: [],
          tax: [],
          grossAnnualRate: ((input.annualRateBps ?? 400) / 10000).toString(),
          inflationAnnualRate: "0.02",
          proportionalFeeAnnualRate: "0.0025",
          rateProvenance: {
            growth: {
              sourceKind: "USER" as const,
              sourceRef: null,
              effectiveDate: firstContributionDate,
              convention: "EFFECTIVE_ANNUAL" as const,
            },
            fee: {
              sourceKind: "USER" as const,
              sourceRef: null,
              effectiveDate: firstContributionDate,
              convention: "EFFECTIVE_ANNUAL" as const,
            },
            inflation: {
              sourceKind: "USER" as const,
              sourceRef: null,
              effectiveDate: firstContributionDate,
              convention: "EFFECTIVE_ANNUAL" as const,
            },
          },
        };

    const res = calculateProjection(projectionInput);

    const isFeasible =
      res.status === "reachable" || res.status === "already_achieved";
    let projectedMonths = horizon;
    if (res.status === "already_achieved") {
      projectedMonths = 0;
    } else if (res.firstQualifyingDate) {
      const qualifyingPoint = res.series.find(
        (s) => s.date === res.firstQualifyingDate,
      );
      if (qualifyingPoint) {
        projectedMonths = qualifyingPoint.month;
      }
    }

    return {
      projectedMonths,
      isFeasible,
      projectedFinalBalanceMinor: res.breakdown.closing.amountMinor,
      targetDateEstimate: res.firstQualifyingDate
        ? res.firstQualifyingDate.slice(0, 7)
        : null,
    };
  }

  compareGoalScenarios(input: CompareScenariosInput): CompareScenariosResult {
    this.incrementRound();

    const projA = this.calculateProjectGoal(input.baseline);
    const projB = this.calculateProjectGoal(input.alternative);

    const baseContribution = BigInt(
      String(input.baseline.monthlyContributionMinor || "0"),
    );
    const altContribution = BigInt(
      String(input.alternative.monthlyContributionMinor || "0"),
    );
    const diffContribution = altContribution - baseContribution;

    return {
      monthsDifference: projB.projectedMonths - projA.projectedMonths,
      contributionDifferenceMinor: diffContribution.toString(),
      baselineMonths: projA.projectedMonths,
      alternativeMonths: projB.projectedMonths,
    };
  }

  executeTool(name: string, args: Record<string, unknown>): unknown {
    switch (name) {
      case "get_spend_summary":
        return this.getSpendSummary(args as SpendSummaryInput);
      case "get_recurring_costs":
        return this.getRecurringCosts(args as RecurringCostsInput);
      case "project_goal":
        return this.projectGoal(args as unknown as ProjectGoalInput);
      case "compare_goal_scenarios":
        return this.compareGoalScenarios(
          args as unknown as CompareScenariosInput,
        );
      default:
        throw new Error(
          `Tool "${name}" is not permitted. Only grounded read-only tools are allowed.`,
        );
    }
  }
}
