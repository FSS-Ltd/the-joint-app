import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
  Query,
  type Type,
} from "@nestjs/common";
import {
  analyticsLifecycleEventInputSchema,
  retentionCohortQuerySchema,
  staffPeriodQuerySchema,
  type StaffMetricsSummaryResponse,
  type StaffRetentionCohortsResponse,
} from "@joint/contracts";
import type { StaffAuthService } from "./staff-auth.service.js";
import type { StaffAnalyticsService } from "./staff-analytics.service.js";

export interface StaffControllerOptions {
  readonly auth: StaffAuthService;
  readonly analytics: StaffAnalyticsService;
}

export function createStaffController(
  options?: StaffControllerOptions,
): Type<unknown> {
  @Controller("v1/staff/analytics")
  class StaffController {
    @Get("metrics")
    @Header("Cache-Control", "no-store")
    async getMetrics(
      @Headers("authorization") authHeader: string | undefined,
      @Query("startDate") startDate: string | undefined,
      @Query("endDate") endDate: string | undefined,
      @Query("timezone") timezone: string | undefined,
    ): Promise<StaffMetricsSummaryResponse> {
      if (!options) {
        throw new BadRequestException("Staff module unavailable.");
      }
      await options.auth.authenticateStaff(
        authHeader,
        "VIEW_METRICS_SUMMARY",
        "metrics_summary",
      );

      const parsed = staffPeriodQuerySchema.safeParse({
        startDate,
        endDate,
        timezone: timezone ?? "Europe/London",
      });
      if (!parsed.success) {
        throw new BadRequestException(
          `Invalid period parameters: ${parsed.error.message}`,
        );
      }

      return options.analytics.getMetricsSummary(parsed.data);
    }

    @Get("retention-cohorts")
    @Header("Cache-Control", "no-store")
    async getRetentionCohorts(
      @Headers("authorization") authHeader: string | undefined,
      @Query("maxCohorts") maxCohorts: string | undefined,
    ): Promise<StaffRetentionCohortsResponse> {
      if (!options) {
        throw new BadRequestException("Staff module unavailable.");
      }
      await options.auth.authenticateStaff(
        authHeader,
        "VIEW_RETENTION_COHORTS",
        "retention_cohorts",
      );

      const parsed = retentionCohortQuerySchema.safeParse({
        maxCohorts: maxCohorts ?? 8,
      });
      if (!parsed.success) {
        throw new BadRequestException(
          `Invalid retention query: ${parsed.error.message}`,
        );
      }

      return options.analytics.getRetentionCohorts(parsed.data);
    }

    @Post("events")
    @HttpCode(202)
    @Header("Cache-Control", "no-store")
    async recordEvent(
      @Headers("authorization") authHeader: string | undefined,
      @Body() body: unknown,
    ): Promise<{ received: true }> {
      if (!options) {
        throw new BadRequestException("Staff module unavailable.");
      }
      const staffContext = await options.auth.authenticateStaff(
        authHeader,
        "INGEST_ANALYTICS_EVENT",
        "analytics_events",
      );

      // Only STAFF_ADMIN can ingest directly through the HTTP interface
      if (staffContext.role !== "STAFF_ADMIN") {
        throw new ForbiddenException(
          "Admin staff privileges required for event ingestion.",
        );
      }

      const parsed = analyticsLifecycleEventInputSchema.safeParse(body);
      if (!parsed.success) {
        throw new BadRequestException(
          `Invalid event payload: ${parsed.error.message}`,
        );
      }

      await options.analytics.recordEvent(parsed.data);
      return { received: true };
    }
  }

  return StaffController;
}
