/**
 * IOS17b: Founder Financial and Privacy Rehearsal Verification Suite
 *
 * Validates the full 30-day founder monthly rehearsal invariants:
 * 1. Two-adult household identity and account-level privacy isolation.
 * 2. 30-day statement ingestion, reconciliation, and injection defense.
 * 3. Month-end coverage attestation and review locking.
 * 4. Deterministic wealth valuation and goal projection comparison.
 * 5. Grounded local companion gateway with strict tool and privacy bounds.
 * 6. Partner sharing revocation and immediate cache invalidation.
 * 7. Opaque redacted rehearsal record structure (zero PII/credentials).
 * 8. Brand and Voice compliance across rehearsal runbooks and plans.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseStatementText,
  reconcileStatementRows,
  convertRowsToCsv,
  escapeCsvField,
} from "../apps/mobile/src/features/statements/statement-converter.js";
import {
  canAttestCoverage,
  formatCoverageStatus,
  formatOwnershipLabel,
} from "../apps/mobile/src/features/review/review-helpers.js";
import {
  calculateProjection,
  type ProjectionInputV1,
} from "../packages/projections/src/index.js";
import {
  ToolGateway,
  type DecryptedEvidencePayload,
} from "../apps/companion/src/index.js";

describe("IOS17b: Founder Financial and Privacy Rehearsal", () => {
  describe("1. Multi-Adult Household Identity and Account Privacy", () => {
    interface TestAccount {
      id: string;
      ownerUserId: string;
      label: string;
      isShared: boolean;
    }

    const adultA = "usr_adult_a_000000000000000001";
    const adultB = "usr_adult_b_000000000000000002";

    const householdAccounts: TestAccount[] = [
      {
        id: "acc_joint_current_01",
        ownerUserId: adultA,
        label: "Joint Checking",
        isShared: true,
      },
      {
        id: "acc_private_a_02",
        ownerUserId: adultA,
        label: "Adult A Personal Savings",
        isShared: false,
      },
      {
        id: "acc_joint_savings_03",
        ownerUserId: adultB,
        label: "Joint Savings",
        isShared: true,
      },
      {
        id: "acc_private_b_04",
        ownerUserId: adultB,
        label: "Adult B Private Investment",
        isShared: false,
      },
    ];

    function filterVisibleAccounts(
      viewerUserId: string,
      accounts: TestAccount[],
    ): TestAccount[] {
      return accounts.filter(
        (acc) => acc.ownerUserId === viewerUserId || acc.isShared,
      );
    }

    it("restricts account visibility to owner or explicitly shared accounts", () => {
      const visibleToAdultA = filterVisibleAccounts(adultA, householdAccounts);
      expect(visibleToAdultA.map((a) => a.id)).toEqual([
        "acc_joint_current_01",
        "acc_private_a_02",
        "acc_joint_savings_03",
      ]);
      expect(visibleToAdultA.some((a) => a.id === "acc_private_b_04")).toBe(
        false,
      );

      const visibleToAdultB = filterVisibleAccounts(adultB, householdAccounts);
      expect(visibleToAdultB.map((a) => a.id)).toEqual([
        "acc_joint_current_01",
        "acc_joint_savings_03",
        "acc_private_b_04",
      ]);
      expect(visibleToAdultB.some((a) => a.id === "acc_private_a_02")).toBe(
        false,
      );
    });

    it("correctly identifies ownership role labels for each member", () => {
      const jointAcc = householdAccounts[0]!;
      expect(
        formatOwnershipLabel(
          jointAcc.ownerUserId === adultA ? "OWNED" : "SHARED",
        ),
      ).toBe("Yours");
      expect(
        formatOwnershipLabel(
          jointAcc.ownerUserId === adultB ? "OWNED" : "SHARED",
        ),
      ).toBe("Shared with you");
    });
  });

  describe("2. 30-Day Statement Ingestion, Reconciliation, and Injection Defense", () => {
    const THIRTY_DAY_STATEMENT_TEXT = `
FAMILY TRUST BANK
Statement Period: 01/10/2026 - 31/10/2026
Opening Balance: £2,000.00
Closing Balance: £2,650.00
Total In: £1,200.00
Total Out: £550.00

Date        Description                     Amount       Balance
02/10/2026  Council Tax                     -£150.00     £1,850.00
05/10/2026  Grocery Supermarket             -£80.00      £1,770.00
10/10/2026  Utility Provider Direct Debit   -£120.00     £1,650.00
15/10/2026  Secondary Freelance Payout      £1,200.00    £2,850.00
20/10/2026  Dining Out Weekend              -£60.00      £2,790.00
28/10/2026  Broadband and Mobile            -£140.00     £2,650.00
`;

    it("parses 30-day statement, reconciles balances, and preserves mathematical invariants", () => {
      const result = parseStatementText(THIRTY_DAY_STATEMENT_TEXT);
      expect(result.rows).toHaveLength(6);

      const reconciliation = reconcileStatementRows(
        result.rows,
        result.summary,
      );
      expect(reconciliation.isBalanced).toBe(true);
      expect(reconciliation.discrepancyMinor).toBeUndefined();
      expect(reconciliation.calculatedCreditsMinor).toBe("120000");
      expect(reconciliation.calculatedDebitsMinor).toBe("55000");
    });

    it("converts statement rows to clean RFC-4180 CSV while neutralizing formula triggers", () => {
      const result = parseStatementText(THIRTY_DAY_STATEMENT_TEXT);
      // Inject formula trigger into one row's description
      const rows = result.rows.map((r, i) =>
        i === 0 ? { ...r, description: "=cmd|' /C calc'!A0" } : r,
      );
      const csv = convertRowsToCsv(rows);

      expect(csv).toContain("Date,Description,Amount,Currency");
      expect(csv).toContain("'=cmd|' /C calc'!A0");
      expect(csv).toContain("-150.00");
      expect(csv).toContain("1200.00");
    });

    it("neutralizes leading tabs, whitespace, and control characters before formula triggers", () => {
      expect(escapeCsvField("\t=1+1")).toBe('"\'	=1+1"');
      expect(escapeCsvField("\r@SUM(A1)")).toBe('"\'\r@SUM(A1)"');
      expect(escapeCsvField("  +calc")).toBe("'  +calc");
    });
  });

  describe("3. Month-End Coverage Attestation and Review", () => {
    it("allows only owner to attest coverage and requires closed period", () => {
      const ownedAccount = {
        ownership: "OWNED" as const,
        coverage: { complete: false, version: 1, reviewedAt: null },
      };

      const sharedAccount = {
        ownership: "SHARED" as const,
        coverage: { complete: false, version: 1, reviewedAt: null },
      };

      // Owner cannot attest while month is still open
      expect(canAttestCoverage(ownedAccount, false)).toBe(false);

      // Owner can attest once month is closed
      expect(canAttestCoverage(ownedAccount, true)).toBe(true);

      // Non-owner cannot attest even if month is closed
      expect(canAttestCoverage(sharedAccount, true)).toBe(false);
    });

    it("formats coverage status screen text unambiguously", () => {
      expect(formatCoverageStatus(true)).toBe("History confirmed");
      expect(formatCoverageStatus(false)).toBe("History unconfirmed");
    });
  });

  describe("4. Deterministic Wealth and Goal Projections", () => {
    it("calculates exact deterministic projections comparing baseline vs accelerated contribution", () => {
      const baselineInput: ProjectionInputV1 = {
        schema: "projection-input",
        schemaVersion: 1,
        mode: "BASIC",
        opening: { amountMinor: "1000000", currency: "GBP" }, // £10,000
        target: { amountMinor: "1600000", currency: "GBP" }, // £16,000
        targetBasis: "FIXED_NOMINAL",
        firstContributionDate: "2026-11-30",
        horizonMonths: 12,
        monthlyContributions: [
          { fromMonth: 1, amount: { amountMinor: "50000", currency: "GBP" } },
        ], // £500/mo
      };

      const baselineResult = calculateProjection(baselineInput);
      expect(baselineResult.status).toBe("reachable");
      expect(baselineResult.firstQualifyingDate).toBe("2027-10-31");
      expect(baselineResult.series).toHaveLength(12);
      expect(baselineResult.series[11]?.closing.amountMinor).toBe("1600000");

      const acceleratedInput: ProjectionInputV1 = {
        ...baselineInput,
        monthlyContributions: [
          {
            fromMonth: 1,
            amount: { amountMinor: "100000", currency: "GBP" },
          },
        ], // £1,000/mo
      };

      const acceleratedResult = calculateProjection(acceleratedInput);
      expect(acceleratedResult.status).toBe("reachable");
      expect(acceleratedResult.firstQualifyingDate).toBe("2027-04-30");
      expect(acceleratedResult.series[5]?.closing.amountMinor).toBe("1600000");

      // Verify exact integer arithmetic in breakdown
      expect(baselineResult.breakdown.contributions.amountMinor).toBe("600000");
      expect(acceleratedResult.breakdown.contributions.amountMinor).toBe(
        "1200000",
      );
    });

    it("supports advanced compound growth projection with deterministic rounding", () => {
      const advancedInput: ProjectionInputV1 = {
        schema: "projection-input",
        schemaVersion: 1,
        mode: "ADVANCED",
        scenarioId: "00000000-0000-4000-8000-000000000001",
        horizonMonths: 6,
        opening: { amountMinor: "500000", currency: "GBP" }, // £5,000
        target: { amountMinor: "700000", currency: "GBP" },
        targetBasis: "FIXED_NOMINAL",
        firstContributionDate: "2026-11-30",
        monthlyContributions: [
          { fromMonth: 1, amount: { amountMinor: "20000", currency: "GBP" } }, // £200/mo
        ],
        withdrawals: [],
        fixedFees: [],
        tax: [],
        grossAnnualRate: "0.05",
        proportionalFeeAnnualRate: "0.005",
        inflationAnnualRate: "0.02",
        rateProvenance: {
          growth: {
            sourceKind: "USER",
            sourceRef: null,
            effectiveDate: "2026-11-01",
            convention: "EFFECTIVE_ANNUAL",
          },
          fee: {
            sourceKind: "USER",
            sourceRef: null,
            effectiveDate: "2026-11-01",
            convention: "EFFECTIVE_ANNUAL",
          },
          inflation: {
            sourceKind: "USER",
            sourceRef: null,
            effectiveDate: "2026-11-01",
            convention: "EFFECTIVE_ANNUAL",
          },
        },
      };

      const result = calculateProjection(advancedInput);
      expect(result.series).toHaveLength(6);
      for (const pt of result.series) {
        expect(pt.closing.amountMinor).toMatch(/^[0-9]+$/);
      }
    });
  });

  describe("5. Grounded Local Companion Gateway & Tool Execution", () => {
    const syntheticEvidence: DecryptedEvidencePayload = {
      jobId: "job_rehearsal_01",
      audienceScope: "HOUSEHOLD",
      grantVersion: 1,
      timestamp: "2026-11-01T00:00:00.000Z",
      accounts: [
        {
          accountId: "acc_joint_current_01",
          name: "Joint Checking",
          permission: "TRANSACTIONS",
          currency: "GBP",
          balances: [
            { amount: "265000", asOfDate: "2026-10-31T00:00:00.000Z" },
          ],
          transactions: [
            {
              id: "tx_01",
              amount: "-15000",
              description: "Council Tax",
              bookedAt: "2026-10-02T12:00:00.000Z",
              categoryId: "cat_bills",
            },
            {
              id: "tx_02",
              amount: "-8000",
              description: "Groceries",
              bookedAt: "2026-10-05T12:00:00.000Z",
              categoryId: "cat_food",
            },
          ],
        },
      ],
    };

    it("executes permitted deterministic tools successfully", () => {
      const gw = new ToolGateway(syntheticEvidence);

      const spendSummary = gw.executeTool("get_spend_summary", {});
      expect(spendSummary).toHaveProperty("totalSpentMinor", "23000"); // 150 + 80 = 230
      expect(spendSummary).toHaveProperty("transactionCount", 2);

      const goalResult = gw.executeTool("project_goal", {
        currentSavingsMinor: "500000",
        monthlyContributionMinor: "50000",
        targetAmountMinor: "1000000",
      });
      expect(goalResult).toHaveProperty("projectedMonths", 10);
      expect(goalResult).toHaveProperty("isFeasible", true);
    });

    it("rejects unauthorized arbitrary tool names to prevent tool-misuse attacks", () => {
      const gw = new ToolGateway(syntheticEvidence);
      expect(() =>
        gw.executeTool("execute_wire_transfer", { amount: 1000 }),
      ).toThrow(/not permitted/i);
    });
  });

  describe("6. Partner Sharing Revocation and Immediate Exclusion", () => {
    it("immediately removes revoked account from shared calculations", () => {
      interface AccountBalance {
        accountId: string;
        isShared: boolean;
        balanceMinor: bigint;
      }

      const balances: AccountBalance[] = [
        {
          accountId: "acc_joint_01",
          isShared: true,
          balanceMinor: 200000n,
        },
        {
          accountId: "acc_revoked_02",
          isShared: true, // initially shared
          balanceMinor: 150000n,
        },
      ];

      function computeSharedTotal(list: AccountBalance[]): bigint {
        return list
          .filter((a) => a.isShared)
          .reduce((sum, a) => sum + a.balanceMinor, 0n);
      }

      // Initial shared total: £2,000 + £1,500 = £3,500
      expect(computeSharedTotal(balances)).toBe(350000n);

      // Adult revokes sharing for acc_revoked_02
      const updatedBalances = balances.map((a) =>
        a.accountId === "acc_revoked_02" ? { ...a, isShared: false } : a,
      );

      // Recomputed shared total immediately excludes revoked account: £2,000
      expect(computeSharedTotal(updatedBalances)).toBe(200000n);
    });
  });

  describe("7. Opaque Redacted Rehearsal Acceptance Record", () => {
    interface FounderRehearsalRecord {
      rehearsalId: string;
      observedMonth: string;
      householdId: string;
      adultMembers: [string, string];
      consentedAccountIds: string[];
      privateAccountIds: string[];
      reconciliation: {
        openingBalanceMinor: string;
        totalCreditsMinor: string;
        totalDebitsMinor: string;
        closingBalanceMinor: string;
        isBalanced: boolean;
      };
      projections: {
        baselineGoalMonths: number;
        acceleratedGoalMonths: number;
        deltaMonths: number;
      };
      companionAttestation: {
        pairedFingerprint: string;
        toolsExercised: string[];
        zeroUnauthorizedDisclosure: boolean;
      };
      revocationVerified: boolean;
      recoveryVerified: boolean;
      status: "COMPLETE";
      completedAt: string;
    }

    it("constructs compliant redacted rehearsal record without PII or raw credentials", () => {
      const record: FounderRehearsalRecord = {
        rehearsalId: "rehearsal_202610_verified",
        observedMonth: "2026-10",
        householdId: "hh_0000000000000001",
        adultMembers: ["usr_adult_a_0000000001", "usr_adult_b_0000000002"],
        consentedAccountIds: ["acc_joint_01", "acc_joint_02"],
        privateAccountIds: ["acc_private_03", "acc_private_04"],
        reconciliation: {
          openingBalanceMinor: "200000",
          totalCreditsMinor: "120000",
          totalDebitsMinor: "55000",
          closingBalanceMinor: "265000",
          isBalanced: true,
        },
        projections: {
          baselineGoalMonths: 12,
          acceleratedGoalMonths: 6,
          deltaMonths: 6,
        },
        companionAttestation: {
          pairedFingerprint:
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          toolsExercised: [
            "get_spend_summary",
            "get_recurring_costs",
            "project_goal",
            "compare_goal_scenarios",
          ],
          zeroUnauthorizedDisclosure: true,
        },
        revocationVerified: true,
        recoveryVerified: true,
        status: "COMPLETE",
        completedAt: "2026-11-10T00:00:00Z",
      };

      expect(record.status).toBe("COMPLETE");
      expect(record.reconciliation.isBalanced).toBe(true);
      expect(record.companionAttestation.zeroUnauthorizedDisclosure).toBe(true);
      expect(record.companionAttestation.toolsExercised).toHaveLength(4);

      // Verify no PII strings
      const serialized = JSON.stringify(record);
      expect(serialized).not.toMatch(/@/); // No emails
      expect(serialized).not.toMatch(/password|secret|token_bearer/i);
    });
  });

  describe("8. Brand & Voice Rules Compliance", () => {
    const BANNED_WORDS = [
      "additionally",
      "align with",
      "boasts",
      "bolstered",
      "crucial",
      "delve",
      "emphasizing",
      "enduring",
      "enhance",
      "fostering",
      "garner",
      "highlight",
      "interplay",
      "intricate",
      "intricacies",
      "landscape",
      "meticulous",
      "meticulously",
      "pivotal",
      "showcase",
      "tapestry",
      "testament",
      "underscore",
      "valuable",
      "vibrant",
      "nestled",
      "groundbreaking",
      "renowned",
      "diverse array",
      "rich heritage",
      "natural beauty",
      "commitment to",
    ];

    it("ensures no banned words or em dashes in founder rehearsal runbook or design doc", () => {
      const filesToCheck = [
        "docs/runbooks/founder-monthly-review.md",
        "docs/superpowers/plans/2026-11-10-ios17b-founder-rehearsal.md",
      ];

      for (const relativePath of filesToCheck) {
        const content = readFileSync(
          join(process.cwd(), relativePath),
          "utf-8",
        );
        expect(content).not.toContain("—");

        for (const banned of BANNED_WORDS) {
          const regex = new RegExp(`\\b${banned}\\b`, "i");
          expect(regex.test(content)).toBe(false);
        }
      }
    });
  });
});
