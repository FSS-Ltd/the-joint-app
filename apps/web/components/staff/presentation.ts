import type {
  ActivationMetric,
  ChurnMetric,
  RetentionCohortCell,
  TurnoverMetric,
} from "@joint/contracts";

export function formatCurrencyMinor(amountMinor: number): string {
  const pounds = amountMinor / 100;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pounds);
}

export function formatRatePercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export interface MetricPresentation {
  readonly isZeroDenominator: boolean;
  readonly rateText: string;
  readonly detailsText: string;
}

export function formatChurnPresentation(
  churn: ChurnMetric,
): MetricPresentation {
  if (churn.denominatorZero || churn.startCount === 0) {
    return {
      isZeroDenominator: true,
      rateText: "N/A",
      detailsText: "0 active at start",
    };
  }
  return {
    isZeroDenominator: false,
    rateText: formatRatePercent(churn.churnRate),
    detailsText: `${churn.lostCount} of ${churn.startCount} households lost`,
  };
}

export function formatActivationPresentation(
  activation: ActivationMetric,
): MetricPresentation {
  if (activation.denominatorZero || activation.registeredCount === 0) {
    return {
      isZeroDenominator: true,
      rateText: "N/A",
      detailsText: "0 registered",
    };
  }
  return {
    isZeroDenominator: false,
    rateText: formatRatePercent(activation.activationRate),
    detailsText: `${activation.activatedCount} of ${activation.registeredCount} activated`,
  };
}

export function formatTurnoverPresentation(
  turnover: TurnoverMetric,
): MetricPresentation {
  if (turnover.denominatorZero || turnover.startCohortCount === 0) {
    return {
      isZeroDenominator: true,
      rateText: "N/A",
      detailsText: "0 active at start",
    };
  }
  return {
    isZeroDenominator: false,
    rateText: formatRatePercent(turnover.turnoverRate),
    detailsText: `${turnover.deletedFromStartCohortCount} of ${turnover.startCohortCount} departed`,
  };
}

export interface CohortCellPresentation {
  readonly suppressed: boolean;
  readonly displayValue: string;
  readonly detailsText?: string;
  readonly tooltip?: string;
}

export function formatCohortCellPresentation(
  cell: RetentionCohortCell,
): CohortCellPresentation {
  if (cell.suppressed) {
    return {
      suppressed: true,
      displayValue: "< 5",
      tooltip: "Suppressed to preserve privacy (< 5 users active)",
    };
  }

  const rate = cell.retentionRate ?? 0;
  return {
    suppressed: false,
    displayValue: formatRatePercent(rate),
    detailsText: `${cell.activeUsers ?? 0} active`,
  };
}
