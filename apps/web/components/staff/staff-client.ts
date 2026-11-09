import type {
  StaffMetricsSummaryResponse,
  StaffRetentionCohortsResponse,
} from "@joint/contracts";

export class StaffClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StaffClientError";
  }
}

export async function fetchStaffMetrics(options?: {
  startDate?: string;
  endDate?: string;
  timezone?: string;
  signal?: AbortSignal;
}): Promise<StaffMetricsSummaryResponse> {
  const params = new URLSearchParams();
  if (options?.startDate) params.set("startDate", options.startDate);
  if (options?.endDate) params.set("endDate", options.endDate);
  if (options?.timezone) params.set("timezone", options.timezone);

  const url = `/api/staff/metrics${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: options?.signal,
  });

  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const errorObj =
      typeof body === "object" && body !== null && "error" in body
        ? (body as { error?: { code?: string; message?: string } }).error
        : undefined;

    const code = errorObj?.code ?? "REQUEST_FAILED";
    const message =
      errorObj?.message ??
      (response.status === 403
        ? "Staff authority required to access commercial metrics."
        : response.status === 401
          ? "Please sign in to access this page."
          : "Failed to load staff metrics.");

    throw new StaffClientError(response.status, code, message);
  }

  return body as StaffMetricsSummaryResponse;
}

export async function fetchStaffRetentionCohorts(options?: {
  maxCohorts?: number;
  signal?: AbortSignal;
}): Promise<StaffRetentionCohortsResponse> {
  const params = new URLSearchParams();
  if (options?.maxCohorts) {
    params.set("maxCohorts", String(options.maxCohorts));
  }

  const url = `/api/staff/retention-cohorts${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: options?.signal,
  });

  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const errorObj =
      typeof body === "object" && body !== null && "error" in body
        ? (body as { error?: { code?: string; message?: string } }).error
        : undefined;

    const code = errorObj?.code ?? "REQUEST_FAILED";
    const message =
      errorObj?.message ??
      (response.status === 403
        ? "Staff authority required to access retention cohorts."
        : response.status === 401
          ? "Please sign in to access this page."
          : "Failed to load retention cohorts.");

    throw new StaffClientError(response.status, code, message);
  }

  return body as StaffRetentionCohortsResponse;
}
