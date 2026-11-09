import type { StaffMetricsSummaryResponse } from "@joint/contracts";
import {
  formatActivationPresentation,
  formatChurnPresentation,
  formatCurrencyMinor,
  formatTurnoverPresentation,
} from "./presentation";

interface StaffMetricsCardsProps {
  readonly metrics: StaffMetricsSummaryResponse;
}

export function StaffMetricsCards({ metrics }: StaffMetricsCardsProps) {
  const churn = formatChurnPresentation(metrics.payingHouseholdChurn);
  const activation = formatActivationPresentation(metrics.userActivation);
  const turnover = formatTurnoverPresentation(metrics.userTurnover);

  return (
    <section aria-label="Commercial Summary Metrics">
      <div className="staff-metrics-grid">
        <div className="staff-card">
          <div className="staff-card-header">
            <h3 className="staff-card-title">Monthly Recurring Revenue</h3>
          </div>
          <p className="staff-card-value">
            {formatCurrencyMinor(metrics.mrrMinor)}
          </p>
          <p className="staff-card-detail">Annual plans normalized / 12</p>
        </div>

        <div className="staff-card">
          <div className="staff-card-header">
            <h3 className="staff-card-title">Active Paid Households</h3>
          </div>
          <p className="staff-card-value">
            {metrics.activePaidHouseholds.toLocaleString()}
          </p>
          <p className="staff-card-detail">Active at period close</p>
        </div>

        <div className="staff-card">
          <div className="staff-card-header">
            <h3 className="staff-card-title">Net Collected Revenue</h3>
          </div>
          <p className="staff-card-value">
            {formatCurrencyMinor(metrics.netCollectedRevenueMinor)}
          </p>
          <p className="staff-card-detail">
            Gross {formatCurrencyMinor(metrics.grossCollectedMinor)} minus
            refunds {formatCurrencyMinor(metrics.refundsMinor)}
          </p>
        </div>

        <div className="staff-card">
          <div className="staff-card-header">
            <h3 className="staff-card-title">Paying Household Churn</h3>
          </div>
          <p className="staff-card-value">{churn.rateText}</p>
          <p className="staff-card-detail">{churn.detailsText}</p>
        </div>

        <div className="staff-card">
          <div className="staff-card-header">
            <h3 className="staff-card-title">User Activation Rate</h3>
          </div>
          <p className="staff-card-value">{activation.rateText}</p>
          <p className="staff-card-detail">{activation.detailsText}</p>
        </div>

        <div className="staff-card">
          <div className="staff-card-header">
            <h3 className="staff-card-title">User Turnover Rate</h3>
          </div>
          <p className="staff-card-value">{turnover.rateText}</p>
          <p className="staff-card-detail">{turnover.detailsText}</p>
        </div>
      </div>
    </section>
  );
}
