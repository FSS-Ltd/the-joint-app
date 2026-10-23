import type { ReactNode } from "react";
import type { SpendingReport } from "@joint/contracts";
import { chartRatio, formatAggregateMoney } from "@joint/domain/cash-flow";
function magnitude(value: string): bigint {
  const n = BigInt(value);
  return n < 0n ? -n : n;
}
export function Summary({ report }: { report: SpendingReport }): ReactNode {
  const s = report.summary;
  if (!s) return null;
  return (
    <>
      <section className="report-hero surface">
        <div>
          <p className="step-label">Spending · {report.month}</p>
          <h2>{formatAggregateMoney(s.spending)}</h2>
          <p>Purchases less refunds booked in this month.</p>
          <span className="report-badge">
            {report.coverage.complete
              ? "Reviewed period"
              : "Incomplete picture"}
          </span>
        </div>
        <dl>
          <div>
            <dt>Confirmed income</dt>
            <dd>{formatAggregateMoney(s.income)}</dd>
          </div>
          <div>
            <dt>Net cash movement</dt>
            <dd>{formatAggregateMoney(s.netCash)}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
export function CategoryBreakdown({
  report,
}: {
  report: SpendingReport;
}): ReactNode {
  const s = report.summary;
  if (!s) return null;
  return (
    <section className="surface form-card">
      <h2>By category</h2>
      {!s.categories.length ? (
        <p>No spending components in this period.</p>
      ) : (
        <>
          <div className="category-bars" aria-hidden="true">
            {s.categories.map((c) => {
              const maximum = s.categories.reduce(
                (m, v) =>
                  magnitude(v.spending.amountMinor) > m
                    ? magnitude(v.spending.amountMinor)
                    : m,
                1n,
              );
              return (
                <div key={JSON.stringify([c.category, c.grouped])}>
                  <span>
                    {c.grouped
                      ? "Other categories (grouped)"
                      : (c.category ?? "Uncategorized")}
                  </span>
                  <div className="report-track">
                    <i
                      style={{
                        width: `${chartRatio(magnitude(c.spending.amountMinor).toString(), maximum.toString(), 100)}%`,
                      }}
                      className={
                        BigInt(c.spending.amountMinor) < 0n ? "warm" : ""
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="field-hint">
            Evergreen bars show spending; apricot bars show net refunds. Exact
            signed values appear below.
          </p>
          <div className="report-table-wrap">
            <table className="report-table">
              <caption>Category spending, including refunds</caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Spending</th>
                  <th scope="col">Components</th>
                </tr>
              </thead>
              <tbody>
                {s.categories.map((c) => (
                  <tr key={JSON.stringify([c.category, c.grouped])}>
                    <th scope="row">
                      {c.grouped
                        ? "Other categories (grouped)"
                        : (c.category ?? "Uncategorized")}
                    </th>
                    <td>{formatAggregateMoney(c.spending)}</td>
                    <td>{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
export function Trend({ report }: { report: SpendingReport }): ReactNode {
  const max = report.trend.reduce(
    (m, v) =>
      magnitude(v.spending.amountMinor) > m
        ? magnitude(v.spending.amountMinor)
        : m,
    1n,
  );
  return (
    <section className="surface form-card">
      <h2>Six-month view</h2>
      <p>
        Incomplete months are labelled. Comparisons require complete history and
        review.
      </p>
      <div className="trend-bars" aria-hidden="true">
        {report.trend.map((v) => (
          <div key={v.month}>
            <i
              className={BigInt(v.spending.amountMinor) < 0n ? "warm" : ""}
              style={{
                height: `${chartRatio(magnitude(v.spending.amountMinor).toString(), max.toString(), 100)}%`,
              }}
            />
            <span>{v.month.slice(5)}</span>
          </div>
        ))}
      </div>
      <div className="report-table-wrap">
        <table className="report-table">
          <caption>Monthly cash flow</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Spending</th>
              <th scope="col">Income</th>
              <th scope="col">History</th>
            </tr>
          </thead>
          <tbody>
            {report.trend.map((v) => (
              <tr key={v.month}>
                <th scope="row">{v.month}</th>
                <td>{formatAggregateMoney(v.spending)}</td>
                <td>{formatAggregateMoney(v.income)}</td>
                <td>{v.complete ? "Complete" : "Incomplete"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {report.comparison ? (
        <p>
          Change from {report.comparison.previousMonth}:{" "}
          {formatAggregateMoney(report.comparison.change)}
        </p>
      ) : (
        <p className="field-hint">
          A like-for-like comparison is unavailable until both months have
          complete history and reviewed classifications.
        </p>
      )}
    </section>
  );
}
