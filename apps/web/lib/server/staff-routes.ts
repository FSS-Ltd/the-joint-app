import {
  retentionCohortQuerySchema,
  staffMetricsSummaryResponseSchema,
  staffPeriodQuerySchema,
  staffRetentionCohortsResponseSchema,
} from "@joint/contracts";
import { sessionToken } from "./browser-security";
import { BffError, json, parseResponse, route } from "./responses";
import { upstream } from "./upstream";

export function readStaffMetrics(request: Request): Promise<Response> {
  return route(async () => {
    const token = await sessionToken(request);
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate") ?? undefined;
    const endDate = url.searchParams.get("endDate") ?? undefined;
    const timezone = url.searchParams.get("timezone") ?? undefined;

    const now = new Date();
    const defaultStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();
    const defaultEnd = now.toISOString();

    const parsed = staffPeriodQuerySchema.safeParse({
      startDate: startDate ?? defaultStart,
      endDate: endDate ?? defaultEnd,
      timezone: timezone ?? "Europe/London",
    });

    if (!parsed.success) {
      throw new BffError(
        400,
        "INVALID_PERIOD",
        "Valid ISO start and end dates are required.",
      );
    }

    const query = parsed.data;
    const searchParams = new URLSearchParams();
    searchParams.set("startDate", query.startDate);
    searchParams.set("endDate", query.endDate);
    searchParams.set("timezone", query.timezone);

    const result = await upstream("/v1/staff/analytics/metrics", {
      token,
      query: searchParams,
    });

    return json(parseResponse(staffMetricsSummaryResponseSchema, result));
  });
}

export function readStaffRetentionCohorts(request: Request): Promise<Response> {
  return route(async () => {
    const token = await sessionToken(request);
    const url = new URL(request.url);
    const maxCohortsParam = url.searchParams.get("maxCohorts");

    const parsed = retentionCohortQuerySchema.safeParse({
      maxCohorts: maxCohortsParam ? Number(maxCohortsParam) : 8,
    });

    if (!parsed.success) {
      throw new BffError(
        400,
        "INVALID_QUERY",
        "Max cohorts must be an integer between 1 and 24.",
      );
    }

    const query = parsed.data;
    const searchParams = new URLSearchParams();
    searchParams.set("maxCohorts", String(query.maxCohorts));

    const result = await upstream("/v1/staff/analytics/retention-cohorts", {
      token,
      query: searchParams,
    });

    return json(parseResponse(staffRetentionCohortsResponseSchema, result));
  });
}
