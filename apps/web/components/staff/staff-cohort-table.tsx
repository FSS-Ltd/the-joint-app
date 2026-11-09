import type { StaffRetentionCohortsResponse } from "@joint/contracts";
import { formatCohortCellPresentation } from "./presentation";

interface StaffCohortTableProps {
  readonly retention: StaffRetentionCohortsResponse;
}

export function StaffCohortTable({ retention }: StaffCohortTableProps) {
  const cohorts = retention.cohorts;

  // Determine maximum week offset present across all rows
  let maxWeekIndex = 0;
  for (const row of cohorts) {
    for (const cell of row.cells) {
      if (cell.weekIndex > maxWeekIndex) {
        maxWeekIndex = cell.weekIndex;
      }
    }
  }

  const weekHeaders = Array.from({ length: maxWeekIndex + 1 }, (_, i) => i);

  return (
    <section className="staff-cohorts-section" aria-label="Retention Cohorts">
      <h2 className="staff-section-title">Weekly Retention Cohorts</h2>
      <p className="staff-section-subtitle">
        Percentage of registering users who perform qualifying activity in
        subsequent weeks. Cohort groups or weekly cells with fewer than 5 active
        users are suppressed to preserve privacy.
      </p>

      {cohorts.length === 0 ? (
        <p className="staff-card-detail">
          No cohort data available for the selected timeframe.
        </p>
      ) : (
        <div className="staff-table-wrapper">
          <table className="staff-table">
            <caption className="eyebrow" style={{ display: "none" }}>
              Weekly User Retention Cohorts
            </caption>
            <thead>
              <tr>
                <th scope="col">Cohort Week</th>
                <th scope="col">Users</th>
                {weekHeaders.map((w) => (
                  <th key={w} scope="col">
                    Week {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((row) => (
                <tr key={row.cohortWeek}>
                  <th scope="row">{row.cohortWeek}</th>
                  <td>
                    {row.cohortSizeSuppressed ? (
                      <span
                        className="staff-cell-suppressed"
                        title="Suppressed (< 5 users)"
                      >
                        &lt; 5
                      </span>
                    ) : (
                      (row.cohortSize ?? 0).toLocaleString()
                    )}
                  </td>
                  {weekHeaders.map((w) => {
                    const cell = row.cells.find((c) => c.weekIndex === w);
                    if (!cell) {
                      return <td key={w}>-</td>;
                    }

                    const pres = formatCohortCellPresentation(cell);
                    if (pres.suppressed) {
                      return (
                        <td key={w}>
                          <span
                            className="staff-cell-suppressed"
                            title={pres.tooltip}
                            aria-label={pres.tooltip}
                          >
                            {pres.displayValue}
                          </span>
                        </td>
                      );
                    }

                    return (
                      <td key={w}>
                        <span className="staff-cell-active">
                          {pres.displayValue}
                        </span>
                        {pres.detailsText && (
                          <span className="staff-cell-sub">
                            {pres.detailsText}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
