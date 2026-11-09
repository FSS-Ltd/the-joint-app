export interface GoalTimelineInputs {
  targetMinor: string;
  allocatedMinor: string;
  monthlyContributionMinor?: string;
  hasOpeningBalance?: boolean;
  sourceAccessRevoked?: boolean;
  historyIncomplete?: boolean;
}

export interface GoalTimelineFeedback {
  sufficient: boolean;
  mode: "amount-only" | "projected";
  currentAmountMinor: string;
  targetAmountMinor: string;
  remainingAmountMinor: string;
  reason: string;
}

export function evaluateGoalTimelineFeedback(
  inputs: GoalTimelineInputs,
): GoalTimelineFeedback {
  const target = BigInt(inputs.targetMinor || "0");
  const allocated = BigInt(inputs.allocatedMinor || "0");
  const remaining = target > allocated ? target - allocated : 0n;

  if (target <= 0n) {
    return {
      sufficient: false,
      mode: "amount-only",
      currentAmountMinor: allocated.toString(),
      targetAmountMinor: target.toString(),
      remainingAmountMinor: remaining.toString(),
      reason:
        "Target amount is not set. Amount-only feedback is shown without estimated completion dates.",
    };
  }

  if (inputs.sourceAccessRevoked) {
    return {
      sufficient: false,
      mode: "amount-only",
      currentAmountMinor: allocated.toString(),
      targetAmountMinor: target.toString(),
      remainingAmountMinor: remaining.toString(),
      reason:
        "Linked account access was revoked. Showing confirmed allocated balances only.",
    };
  }

  if (inputs.historyIncomplete) {
    return {
      sufficient: false,
      mode: "amount-only",
      currentAmountMinor: allocated.toString(),
      targetAmountMinor: target.toString(),
      remainingAmountMinor: remaining.toString(),
      reason:
        "Transaction history is partial or unreviewed. Timeline projection is withheld to prevent false estimates.",
    };
  }

  if (inputs.hasOpeningBalance !== true) {
    return {
      sufficient: false,
      mode: "amount-only",
      currentAmountMinor: allocated.toString(),
      targetAmountMinor: target.toString(),
      remainingAmountMinor: remaining.toString(),
      reason:
        "Opening valuation is missing. Disposable cash and target dates are not inferred from unspent budget caps.",
    };
  }

  const monthly = BigInt(inputs.monthlyContributionMinor || "0");
  if (monthly <= 0n) {
    return {
      sufficient: false,
      mode: "amount-only",
      currentAmountMinor: allocated.toString(),
      targetAmountMinor: target.toString(),
      remainingAmountMinor: remaining.toString(),
      reason:
        "No recurring monthly contribution schedule set. Projected timeline requires planned contributions.",
    };
  }

  return {
    sufficient: true,
    mode: "projected",
    currentAmountMinor: allocated.toString(),
    targetAmountMinor: target.toString(),
    remainingAmountMinor: remaining.toString(),
    reason: "Complete inputs confirmed. Projection model active.",
  };
}
