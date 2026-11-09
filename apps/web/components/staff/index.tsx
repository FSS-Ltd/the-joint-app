"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  StaffMetricsSummaryResponse,
  StaffRetentionCohortsResponse,
} from "@joint/contracts";
import {
  fetchStaffMetrics,
  fetchStaffRetentionCohorts,
  StaffClientError,
} from "./staff-client";
import {
  computePeriodPresetRange,
  type PeriodPreset,
  StaffFilters,
} from "./staff-filters";
import { StaffMetricsCards } from "./staff-metrics-cards";
import { StaffCohortTable } from "./staff-cohort-table";
import { StaffErrorBanner, StaffRefusalView } from "./staff-error-state";
import "./staff.css";

export function StaffDashboardScreen() {
  const [preset, setPreset] = useState<PeriodPreset>("mtd");
  const [metrics, setMetrics] = useState<StaffMetricsSummaryResponse | null>(
    null,
  );
  const [retention, setRetention] =
    useState<StaffRetentionCohortsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<{
    status: number;
    message: string;
  } | null>(null);

  const loadData = useCallback(async (selectedPreset: PeriodPreset) => {
    setIsLoading(true);
    setError(null);

    const range = computePeriodPresetRange(selectedPreset);
    try {
      const [metricsData, retentionData] = await Promise.all([
        fetchStaffMetrics({
          startDate: range.startDate,
          endDate: range.endDate,
          timezone: range.timezone,
        }),
        fetchStaffRetentionCohorts({ maxCohorts: 8 }),
      ]);

      setMetrics(metricsData);
      setRetention(retentionData);
    } catch (err) {
      if (err instanceof StaffClientError) {
        setError({ status: err.status, message: err.message });
      } else {
        setError({
          status: 500,
          message:
            "An unexpected error occurred while loading commercial analytics.",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(preset);
  }, [loadData, preset]);

  // Handle 401 and 403 access refusal states
  if (error && (error.status === 401 || error.status === 403)) {
    return (
      <main className="staff-container">
        <StaffRefusalView status={error.status} message={error.message} />
      </main>
    );
  }

  return (
    <main className="staff-container">
      <header className="staff-header">
        <div className="staff-header-top">
          <h1 className="staff-title">Commercial Analytics</h1>
          <span className="staff-badge">Internal Staff Portal</span>
        </div>
        <p className="staff-subtitle">
          Audited commercial metrics, paying-household churn, and retention
          dynamics.
        </p>
      </header>

      <StaffFilters
        currentPreset={preset}
        onSelectPreset={setPreset}
        onRefresh={() => void loadData(preset)}
        isLoading={isLoading}
        lastGeneratedAt={retention?.generatedAt}
      />

      {error && (
        <StaffErrorBanner
          message={error.message}
          onRetry={() => void loadData(preset)}
        />
      )}

      {isLoading && !metrics ? (
        <div className="staff-loading-skeleton" role="status" aria-busy="true">
          <p>Loading commercial analytics...</p>
        </div>
      ) : (
        <>
          {metrics && <StaffMetricsCards metrics={metrics} />}
          {retention && <StaffCohortTable retention={retention} />}
        </>
      )}
    </main>
  );
}
