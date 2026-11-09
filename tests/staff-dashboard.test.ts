import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  StaffMetricsSummaryResponse,
  StaffRetentionCohortsResponse,
} from "../packages/contracts/src/index.js";
import {
  formatCurrencyMinor,
  formatRatePercent,
  formatChurnPresentation,
  formatActivationPresentation,
  formatTurnoverPresentation,
  formatCohortCellPresentation,
} from "../apps/web/components/staff/presentation.js";
import {
  readStaffMetrics,
  readStaffRetentionCohorts,
} from "../apps/web/lib/server/staff-routes.js";
import { upstream } from "../apps/web/lib/server/upstream.js";

const token = "s".repeat(43);
const csrf = "c".repeat(43);

const mockMetricsSummary: StaffMetricsSummaryResponse = {
  activePaidHouseholds: 42,
  mrrMinor: 20958, // £209.58
  grossCollectedMinor: 20958,
  refundsMinor: 0,
  netCollectedRevenueMinor: 20958,
  payingHouseholdChurn: {
    churnRate: 0.0455,
    lostCount: 2,
    startCount: 44,
    denominatorZero: false,
  },
  userActivation: {
    activationRate: 0.75,
    activatedCount: 30,
    registeredCount: 40,
    denominatorZero: false,
  },
  userTurnover: {
    turnoverRate: 0.05,
    deletedFromStartCohortCount: 2,
    startCohortCount: 40,
    denominatorZero: false,
  },
  promotionalDiscounts: [],
  period: {
    startDate: "2026-10-01T00:00:00.000Z",
    endDate: "2026-10-31T23:59:59.999Z",
    timezone: "Europe/London",
  },
  unknownSourceCoverage: false,
};

const mockCohortsResponse: StaffRetentionCohortsResponse = {
  suppressionThreshold: 5,
  cohorts: [
    {
      cohortWeek: "2026-W40",
      cohortSizeSuppressed: false,
      cohortSize: 10,
      cells: [
        {
          weekIndex: 0,
          suppressed: false,
          activeUsers: 10,
          retentionRate: 1.0,
        },
        {
          weekIndex: 1,
          suppressed: false,
          activeUsers: 7,
          retentionRate: 0.7,
        },
        {
          weekIndex: 2,
          suppressed: true, // Less than 5 active users in Week 2
        },
      ],
    },
    {
      cohortWeek: "2026-W41",
      cohortSizeSuppressed: true, // Less than 5 members in cohort
      cells: [
        {
          weekIndex: 0,
          suppressed: true,
        },
      ],
    },
  ],
  generatedAt: "2026-11-01T00:05:00.000Z",
};

function createBffRequest(
  path: string,
  options?: {
    cookie?: string;
    origin?: string;
  },
): Request {
  const cookieHeader =
    options?.cookie ?? `joint-session=${token}; joint-csrf=${csrf}`;
  return new Request(`http://127.0.0.1:3000${path}`, {
    method: "GET",
    headers: {
      Cookie: cookieHeader,
      Origin: options?.origin ?? "http://127.0.0.1:3000",
      "X-CSRF-Token": csrf,
      Accept: "application/json",
    },
  });
}

describe("IOS15 Staff Revenue, Churn and Retention Dashboard", () => {
  let forwardedRequests: { url: string; init: RequestInit }[];
  let upstreamResponseStatus: number;
  let upstreamResponseBody: unknown;

  beforeEach(() => {
    vi.stubEnv("WEB_ORIGIN", "http://127.0.0.1:3000");
    vi.stubEnv("API_BASE_URL", "http://127.0.0.1:3001");
    vi.stubEnv("AUTH_PROVIDER", "local");

    forwardedRequests = [];
    upstreamResponseStatus = 200;
    upstreamResponseBody = mockMetricsSummary;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        forwardedRequests.push({ url: String(url), init: init ?? {} });
        return Response.json(upstreamResponseBody, {
          status: upstreamResponseStatus,
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe("1. Upstream Route Allowlist and Forwarding", () => {
    it("allows /v1/staff/analytics/metrics and forwards session token", async () => {
      const result = await upstream("/v1/staff/analytics/metrics", {
        token,
      });

      expect(result).toEqual(mockMetricsSummary);
      expect(forwardedRequests).toHaveLength(1);
      expect(forwardedRequests[0]?.url).toBe(
        "http://127.0.0.1:3001/v1/staff/analytics/metrics",
      );
      const headers = forwardedRequests[0]?.init.headers as Record<
        string,
        string
      >;
      expect(headers.Authorization).toBe(`Session ${token}`);
    });

    it("allows /v1/staff/analytics/retention-cohorts and forwards query params", async () => {
      upstreamResponseBody = mockCohortsResponse;
      const query = new URLSearchParams({ maxCohorts: "8" });

      const result = await upstream("/v1/staff/analytics/retention-cohorts", {
        token,
        query,
      });

      expect(result).toEqual(mockCohortsResponse);
      expect(forwardedRequests).toHaveLength(1);
      expect(forwardedRequests[0]?.url).toBe(
        "http://127.0.0.1:3001/v1/staff/analytics/retention-cohorts?maxCohorts=8",
      );
    });

    it("maps 403 Forbidden upstream to a safe FORBIDDEN BffError", async () => {
      upstreamResponseStatus = 403;
      upstreamResponseBody = {
        statusCode: 403,
        message: "Explicit staff authority required.",
        error: "Forbidden",
      };

      await expect(
        upstream("/v1/staff/analytics/metrics", { token }),
      ).rejects.toMatchObject({
        status: 403,
        code: "FORBIDDEN",
        message: expect.stringMatching(/Staff authority required/i),
      });
    });

    it("maps 401 Unauthorized upstream to UNAUTHORIZED BffError", async () => {
      upstreamResponseStatus = 401;
      upstreamResponseBody = {
        statusCode: 401,
        message: "Unauthorized",
      };

      await expect(
        upstream("/v1/staff/analytics/metrics", { token }),
      ).rejects.toMatchObject({
        status: 401,
        code: "UNAUTHORIZED",
      });
    });
  });

  describe("2. Web BFF Route Handlers", () => {
    it("rejects unauthenticated requests missing session cookie with 401", async () => {
      const request = createBffRequest("/api/staff/metrics", { cookie: "" });
      const response = await readStaffMetrics(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error.code).toBe("SIGN_IN_REQUIRED");
    });

    it("forwards validated period parameters and returns parsed metrics summary", async () => {
      const request = createBffRequest(
        "/api/staff/metrics?startDate=2026-10-01T00:00:00.000Z&endDate=2026-10-31T23:59:59.999Z&timezone=Europe/London",
      );
      const response = await readStaffMetrics(request);

      expect(response.status).toBe(200);
      const data = (await response.json()) as StaffMetricsSummaryResponse;
      expect(data.activePaidHouseholds).toBe(42);
      expect(data.mrrMinor).toBe(20958);

      expect(forwardedRequests).toHaveLength(1);
      const forwardedUrl = new URL(forwardedRequests[0]?.url ?? "");
      expect(forwardedUrl.searchParams.get("startDate")).toBe(
        "2026-10-01T00:00:00.000Z",
      );
      expect(forwardedUrl.searchParams.get("endDate")).toBe(
        "2026-10-31T23:59:59.999Z",
      );
      expect(forwardedUrl.searchParams.get("timezone")).toBe("Europe/London");
    });

    it("rejects unauthorized household users with 403 Forbidden", async () => {
      upstreamResponseStatus = 403;
      upstreamResponseBody = {
        statusCode: 403,
        message: "Explicit staff authority required.",
      };

      const request = createBffRequest("/api/staff/metrics");
      const response = await readStaffMetrics(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error.code).toBe("FORBIDDEN");
    });

    it("handles retention cohorts query and forwards maxCohorts", async () => {
      upstreamResponseBody = mockCohortsResponse;
      const request = createBffRequest(
        "/api/staff/retention-cohorts?maxCohorts=4",
      );
      const response = await readStaffRetentionCohorts(request);

      expect(response.status).toBe(200);
      const data = (await response.json()) as StaffRetentionCohortsResponse;
      expect(data.suppressionThreshold).toBe(5);
      expect(data.cohorts).toHaveLength(2);

      expect(forwardedRequests).toHaveLength(1);
      const forwardedUrl = new URL(forwardedRequests[0]?.url ?? "");
      expect(forwardedUrl.searchParams.get("maxCohorts")).toBe("4");
    });
  });

  describe("3. Presentation, Formatting and Privacy Safeguards", () => {
    it("formats minor currency units to GBP currency string", () => {
      expect(formatCurrencyMinor(20958)).toBe("£209.58");
      expect(formatCurrencyMinor(0)).toBe("£0.00");
      expect(formatCurrencyMinor(499)).toBe("£4.99");
      expect(formatCurrencyMinor(100000)).toBe("£1,000.00");
    });

    it("formats ratios into percentage strings", () => {
      expect(formatRatePercent(0.125)).toBe("12.5%");
      expect(formatRatePercent(1.0)).toBe("100.0%");
      expect(formatRatePercent(0.0)).toBe("0.0%");
    });

    it("handles denominator zero in churn rate without dividing by zero", () => {
      const zeroChurn = {
        churnRate: 0.0,
        lostCount: 0,
        startCount: 0,
        denominatorZero: true,
      };
      const formatted = formatChurnPresentation(zeroChurn);
      expect(formatted.isZeroDenominator).toBe(true);
      expect(formatted.rateText).toBe("N/A");
      expect(formatted.detailsText).toBe("0 active at start");

      const normalChurn = {
        churnRate: 0.05,
        lostCount: 2,
        startCount: 40,
        denominatorZero: false,
      };
      const normalFormatted = formatChurnPresentation(normalChurn);
      expect(normalFormatted.isZeroDenominator).toBe(false);
      expect(normalFormatted.rateText).toBe("5.0%");
      expect(normalFormatted.detailsText).toBe("2 of 40 households lost");
    });

    it("handles denominator zero in activation rate cleanly", () => {
      const zeroActivation = {
        activationRate: 0.0,
        activatedCount: 0,
        registeredCount: 0,
        denominatorZero: true,
      };
      const formatted = formatActivationPresentation(zeroActivation);
      expect(formatted.rateText).toBe("N/A");
      expect(formatted.detailsText).toBe("0 registered");
    });

    it("handles denominator zero in turnover rate cleanly", () => {
      const zeroTurnover = {
        turnoverRate: 0.0,
        deletedFromStartCohortCount: 0,
        startCohortCount: 0,
        denominatorZero: true,
      };
      const formatted = formatTurnoverPresentation(zeroTurnover);
      expect(formatted.rateText).toBe("N/A");
      expect(formatted.detailsText).toBe("0 active at start");
    });

    it("formats suppressed cohort cells without leaking counts (< 5 threshold)", () => {
      const suppressedCell = {
        weekIndex: 2,
        suppressed: true,
      };
      const formatted = formatCohortCellPresentation(suppressedCell);
      expect(formatted.suppressed).toBe(true);
      expect(formatted.displayValue).toBe("< 5");
      expect(formatted.tooltip).toBe(
        "Suppressed to preserve privacy (< 5 users active)",
      );

      const unsuppressedCell = {
        weekIndex: 1,
        suppressed: false,
        activeUsers: 7,
        retentionRate: 0.7,
      };
      const unsuppressedFormatted =
        formatCohortCellPresentation(unsuppressedCell);
      expect(unsuppressedFormatted.suppressed).toBe(false);
      expect(unsuppressedFormatted.displayValue).toBe("70.0%");
      expect(unsuppressedFormatted.detailsText).toBe("7 active");
    });
  });
});
