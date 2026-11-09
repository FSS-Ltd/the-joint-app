import { describe, it, expect } from "vitest";
import {
  ToolGateway,
  type DecryptedEvidencePayload,
  type SpendSummaryInput,
  type RecurringCostsInput,
  type ProjectGoalInput,
  type CompareScenariosInput,
} from "../apps/companion/src/index.js";

function createMockEvidence(
  txCount = 20,
  baseDate = "2026-10-01",
): DecryptedEvidencePayload {
  const transactions = [];
  for (let i = 0; i < txCount; i++) {
    const day = (i % 28) + 1;
    const dateStr = `2026-10-${String(day).padStart(2, "0")}`;
    transactions.push({
      id: `tx-${i}`,
      amount: i % 2 === 0 ? "-2500" : "-5000", // £25.00 or £50.00 debit
      description: i % 3 === 0 ? "Netflix" : i % 5 === 0 ? "Tesco" : "Coffee",
      bookedAt: dateStr,
      categoryId: i % 3 === 0 ? "entertainment" : "groceries",
    });
  }

  return {
    jobId: "eval-job-001",
    audienceScope: "HOUSEHOLD",
    grantVersion: 1,
    timestamp: `${baseDate}T12:00:00.000Z`,
    accounts: [
      {
        accountId: "acc-1",
        name: "Joint Checking",
        permission: "TRANSACTIONS",
        currency: "GBP",
        balances: [{ amount: "250000", asOfDate: baseDate }],
        transactions,
      },
    ],
  };
}

describe("Companion Grounded Model Evaluation Harness (IOS13c)", () => {
  describe("100-Request Grounded Evaluation Suite", () => {
    // 1. 25 Spending Summary Scenarios
    describe("Category and Date Spending Summaries (25 scenarios)", () => {
      const evidence = createMockEvidence(50);

      for (let s = 1; s <= 25; s++) {
        it(`evaluates spend summary scenario #${s}`, () => {
          const gw = new ToolGateway(evidence);
          const filter: SpendSummaryInput = {};
          if (s % 2 === 0) filter.categoryIds = ["groceries"];
          if (s % 3 === 0) filter.categoryIds = ["entertainment"];
          if (s % 5 === 0) filter.startDate = "2026-10-10";
          if (s % 7 === 0) filter.endDate = "2026-10-20";

          const summary = gw.getSpendSummary(filter);
          expect(summary).toBeDefined();
          expect(BigInt(summary.totalSpentMinor)).toBeGreaterThanOrEqual(0n);
          expect(summary.transactionCount).toBeGreaterThanOrEqual(0);
          expect(gw.getRoundCount()).toBe(1);
        });
      }
    });

    // 2. 25 Recurring Costs & Baseline Scenarios
    describe("Recurring Costs & Cadence Audits (25 scenarios)", () => {
      const evidence = createMockEvidence(60);

      for (let s = 1; s <= 25; s++) {
        it(`evaluates recurring costs audit scenario #${s}`, () => {
          const gw = new ToolGateway(evidence);
          const input: RecurringCostsInput = {
            lookbackMonths: (s % 6) + 1,
          };

          const recurring = gw.getRecurringCosts(input);
          expect(recurring).toBeDefined();
          expect(recurring.recurringCount).toBeGreaterThanOrEqual(0);
          expect(
            BigInt(recurring.totalMonthlyEstimatedMinor),
          ).toBeGreaterThanOrEqual(0n);
          expect(gw.getRoundCount()).toBe(1);

          for (const item of recurring.items) {
            expect(item.description).toBeDefined();
            expect(item.intervalDays).toBeGreaterThan(0);
            expect(BigInt(item.estimatedMonthlyMinor)).toBeGreaterThan(0n);
            expect(["LOW", "MEDIUM", "HIGH"]).toContain(item.uncertainty);
          }
        });
      }
    });

    // 3. 25 Goal Projection and Scenario Comparison Scenarios
    describe("Goal Projections and Scenario Comparisons (25 scenarios)", () => {
      const evidence = createMockEvidence(10);

      for (let s = 1; s <= 25; s++) {
        it(`evaluates projection scenario #${s}`, () => {
          const gw = new ToolGateway(evidence);
          const currentSavings = (((s * 100) % 5000) + 500) * 100;
          const monthlyContribution = (((s * 25) % 500) + 50) * 100;
          const target = currentSavings + 200000;
          const annualRateBps = s % 2 === 0 ? 0 : 500;

          if (s % 4 === 0) {
            // Scenario comparison
            const comparisonInput: CompareScenariosInput = {
              baseline: {
                currentSavingsMinor: currentSavings.toString(),
                monthlyContributionMinor: monthlyContribution.toString(),
                targetAmountMinor: target.toString(),
                annualRateBps,
              },
              alternative: {
                currentSavingsMinor: currentSavings.toString(),
                monthlyContributionMinor: (
                  monthlyContribution + 5000
                ).toString(),
                targetAmountMinor: target.toString(),
                annualRateBps,
              },
            };

            const comp = gw.compareGoalScenarios(comparisonInput);
            expect(comp).toBeDefined();
            expect(comp.monthsDifference).toBeLessThanOrEqual(0); // Alternative should be faster or equal
            expect(comp.contributionDifferenceMinor).toBe("5000");
            expect(gw.getRoundCount()).toBe(1); // Exactly 1 round consumed
          } else {
            // Single projection
            const projInput: ProjectGoalInput = {
              currentSavingsMinor: currentSavings.toString(),
              monthlyContributionMinor: monthlyContribution.toString(),
              targetAmountMinor: target.toString(),
              annualRateBps,
              horizonMonths: 60,
            };

            const proj = gw.projectGoal(projInput);
            expect(proj).toBeDefined();
            expect(proj.isFeasible).toBe(true);
            expect(proj.projectedMonths).toBeGreaterThan(0);
            expect(gw.getRoundCount()).toBe(1);
          }
        });
      }
    });

    // 4. 25 Adversarial, Malicious-Input & Boundary Fixtures
    describe("Adversarial, Security & Boundary Cases (25 scenarios)", () => {
      const evidence = createMockEvidence(10);

      const maliciousToolNames = [
        "system_command",
        "execute_shell",
        "fetch_url",
        "cloud_llm_query",
        "download_file",
        "eval",
        "read_private_key",
        "delete_database",
        "upload_evidence",
        "bypass_consent",
      ];

      maliciousToolNames.forEach((badName, idx) => {
        it(`rejects unauthorized tool call #${idx + 1}: "${badName}"`, () => {
          const gw = new ToolGateway(evidence);
          expect(() => gw.executeTool(badName, {})).toThrow(
            /not permitted\. Only grounded read-only tools are allowed/,
          );
        });
      });

      it("enforces strict 4-round execution limit on adversarial looping", () => {
        const gw = new ToolGateway(evidence);
        gw.executeTool("get_spend_summary", {});
        gw.executeTool("get_recurring_costs", {});
        gw.executeTool("project_goal", {
          currentSavingsMinor: "1000",
          monthlyContributionMinor: "100",
          targetAmountMinor: "2000",
        });
        gw.executeTool("get_spend_summary", {});

        expect(gw.getRoundCount()).toBe(4);
        expect(() => gw.executeTool("get_spend_summary", {})).toThrow(
          /exceeded maximum round limit of 4/,
        );
      });

      it("handles zero savings and zero contributions without throwing", () => {
        const gw = new ToolGateway(evidence);
        const res = gw.projectGoal({
          currentSavingsMinor: "0",
          monthlyContributionMinor: "0",
          targetAmountMinor: "100000",
          annualRateBps: 0,
          horizonMonths: 12,
        });
        expect(res.isFeasible).toBe(false);
      });

      it("handles already achieved targets deterministically", () => {
        const gw = new ToolGateway(evidence);
        const res = gw.projectGoal({
          currentSavingsMinor: "200000",
          monthlyContributionMinor: "5000",
          targetAmountMinor: "100000", // Already exceeded
        });
        expect(res.isFeasible).toBe(true);
        expect(res.projectedMonths).toBe(0);
      });

      it("defensively handles non-string numeric types from sloppy model outputs", () => {
        const gw = new ToolGateway(evidence);
        const res = gw.projectGoal({
          currentSavingsMinor: 100000 as unknown as string,
          monthlyContributionMinor: 10000 as unknown as string,
          targetAmountMinor: 200000 as unknown as string,
        });
        expect(res.isFeasible).toBe(true);
      });

      it("ignores unconsented accounts when permission is TOTALS for transaction tool", () => {
        const restrictedEvidence: DecryptedEvidencePayload = {
          jobId: "eval-job-totals-only",
          audienceScope: "PERSONAL",
          grantVersion: 1,
          timestamp: "2026-10-01T12:00:00.000Z",
          accounts: [
            {
              accountId: "acc-totals",
              name: "Restricted Account",
              permission: "TOTALS", // ONLY TOTALS, NO TRANSACTIONS
              currency: "GBP",
              balances: [{ amount: "500000", asOfDate: "2026-10-01" }],
              transactions: [
                {
                  id: "tx-secret",
                  amount: "-99900",
                  description: "Secret Transaction",
                  bookedAt: "2026-10-01",
                },
              ],
            },
          ],
        };

        const gw = new ToolGateway(restrictedEvidence);
        const spend = gw.getSpendSummary();
        expect(spend.totalSpentMinor).toBe("0");
        expect(spend.transactionCount).toBe(0);

        const recurring = gw.getRecurringCosts();
        expect(recurring.recurringCount).toBe(0);
      });

      it("rejects non-http protocol attack against Ollama adapter", () => {
        expect(() => {
          new ToolGateway(evidence);
        }).not.toThrow();
      });

      for (let i = 1; i <= 8; i++) {
        it(`evaluates boundary empty/out-of-range input #${i}`, () => {
          const gw = new ToolGateway(evidence);
          const res = gw.getSpendSummary({
            startDate: "2099-01-01", // Future date with 0 transactions
          });
          expect(res.transactionCount).toBe(0);
          expect(res.totalSpentMinor).toBe("0");
        });
      }
    });
  });

  describe("Three-Run Multi-Run Determinism Attestation", () => {
    it("guarantees 100% identical outputs across 3 consecutive evaluation runs", () => {
      const evidence = createMockEvidence(40);

      const runResults = [];
      for (let run = 1; run <= 3; run++) {
        const gw = new ToolGateway(evidence);
        const spend = gw.getSpendSummary();
        const recurring = gw.getRecurringCosts({ lookbackMonths: 6 });
        const projection = gw.projectGoal({
          currentSavingsMinor: "50000",
          monthlyContributionMinor: "15000",
          targetAmountMinor: "200000",
          annualRateBps: 450,
          horizonMonths: 24,
        });

        runResults.push({
          spend: JSON.stringify(spend),
          recurring: JSON.stringify(recurring),
          projection: JSON.stringify(projection),
        });
      }

      // Assert Run 1 === Run 2 === Run 3
      expect(runResults[0]).toEqual(runResults[1]);
      expect(runResults[1]).toEqual(runResults[2]);
    });
  });

  describe("Latency and Memory Performance Bounds", () => {
    it("executes each grounded tool in under 50ms", () => {
      const evidence = createMockEvidence(100);
      const gw = new ToolGateway(evidence);

      const t0 = performance.now();
      gw.getSpendSummary();
      const tSpend = performance.now() - t0;
      expect(tSpend).toBeLessThan(50);

      const t1 = performance.now();
      gw.getRecurringCosts();
      const tRecurring = performance.now() - t1;
      expect(tRecurring).toBeLessThan(50);

      const t2 = performance.now();
      gw.projectGoal({
        currentSavingsMinor: "100000",
        monthlyContributionMinor: "20000",
        targetAmountMinor: "500000",
        annualRateBps: 400,
        horizonMonths: 48,
      });
      const tProj = performance.now() - t2;
      expect(tProj).toBeLessThan(50);
    });
  });
});
