export type PeriodPreset = "mtd" | "prior_month" | "trailing_30";

export interface PeriodRange {
  startDate: string;
  endDate: string;
  timezone: "Europe/London";
}

export function computePeriodPresetRange(preset: PeriodPreset): PeriodRange {
  const now = new Date();
  const timezone = "Europe/London";

  if (preset === "mtd") {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    return {
      startDate: start.toISOString(),
      endDate: now.toISOString(),
      timezone,
    };
  }

  if (preset === "prior_month") {
    const year =
      now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    const month = now.getUTCMonth() === 0 ? 11 : now.getUTCMonth() - 1;
    const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    // Last day of prior month is day 0 of current month
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999),
    );
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      timezone,
    };
  }

  // Trailing 30 days
  const start = new Date(now.getTime() - 30 * 86400000);
  return {
    startDate: start.toISOString(),
    endDate: now.toISOString(),
    timezone,
  };
}

interface StaffFiltersProps {
  readonly currentPreset: PeriodPreset;
  readonly onSelectPreset: (preset: PeriodPreset) => void;
  readonly onRefresh: () => void;
  readonly isLoading: boolean;
  readonly lastGeneratedAt?: string;
}

export function StaffFilters({
  currentPreset,
  onSelectPreset,
  onRefresh,
  isLoading,
  lastGeneratedAt,
}: StaffFiltersProps) {
  return (
    <div
      className="staff-filter-bar"
      role="toolbar"
      aria-label="Dashboard period filters"
    >
      <div className="staff-filter-group">
        <button
          type="button"
          className={`staff-filter-btn ${currentPreset === "mtd" ? "active" : ""}`}
          onClick={() => onSelectPreset("mtd")}
          aria-pressed={currentPreset === "mtd"}
          disabled={isLoading}
        >
          Month to Date
        </button>
        <button
          type="button"
          className={`staff-filter-btn ${currentPreset === "prior_month" ? "active" : ""}`}
          onClick={() => onSelectPreset("prior_month")}
          aria-pressed={currentPreset === "prior_month"}
          disabled={isLoading}
        >
          Prior Month
        </button>
        <button
          type="button"
          className={`staff-filter-btn ${currentPreset === "trailing_30" ? "active" : ""}`}
          onClick={() => onSelectPreset("trailing_30")}
          aria-pressed={currentPreset === "trailing_30"}
          disabled={isLoading}
        >
          Trailing 30 Days
        </button>
      </div>

      <div className="staff-meta-group">
        <span title="Pinned operational timezone">Timezone: Europe/London</span>
        {lastGeneratedAt && (
          <span title="Data freshness timestamp">
            Freshness:{" "}
            {new Date(lastGeneratedAt).toLocaleTimeString("en-GB", {
              timeZone: "UTC",
            })}{" "}
            UTC
          </span>
        )}
        <button
          type="button"
          className="staff-refresh-btn"
          onClick={onRefresh}
          disabled={isLoading}
          aria-label="Refresh metrics"
        >
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    </div>
  );
}
