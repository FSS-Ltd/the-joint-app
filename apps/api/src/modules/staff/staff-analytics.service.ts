import { BadRequestException, Injectable } from "@nestjs/common";
import type { PrismaClient, Prisma } from "@joint/database/client";
import {
  analyticsLifecycleEventInputSchema,
  type AnalyticsLifecycleEventInput,
  type RetentionCohortQuery,
  type StaffMetricsSummaryResponse,
  type StaffPeriodQuery,
  type StaffRetentionCohortsResponse,
} from "@joint/contracts";
import {
  AnalyticsMetricsEngine,
  type RawAnalyticsEvent,
} from "./metrics-engine.js";

const FORBIDDEN_STEM_ROOTS = [
  "merchant",
  "balance",
  "sortcode",
  "accountnumber",
  "iban",
  "prompt",
  "rawtext",
  "password",
  "token",
  "secret",
  "credential",
  "cardnumber",
  "cvv",
  "routingnumber",
  "description",
  "csv",
  "transactionid",
];

function inspectPayloadForSensitiveData(payload: unknown): void {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      inspectPayloadForSensitiveData(item);
    }
    return;
  }
  if (!payload || typeof payload !== "object") {
    return;
  }
  const record = payload as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const stem of FORBIDDEN_STEM_ROOTS) {
      if (normalizedKey.includes(stem)) {
        throw new BadRequestException(
          `Sensitive financial attribute '${key}' is prohibited in analytics events.`,
        );
      }
    }
    const val = record[key];
    if (val && typeof val === "object") {
      inspectPayloadForSensitiveData(val);
    }
  }
}

@Injectable()
export class StaffAnalyticsService {
  private readonly engine: AnalyticsMetricsEngine;

  constructor(private readonly database: PrismaClient) {
    this.engine = new AnalyticsMetricsEngine({ suppressionThreshold: 5 });
  }

  async recordEvent(input: AnalyticsLifecycleEventInput): Promise<void> {
    const validated = analyticsLifecycleEventInputSchema.parse(input);

    // Reject sensitive financial or personal data payloads
    inspectPayloadForSensitiveData(validated.payload);

    // Idempotent commit before any notification or downstream processing
    const existing = await this.database.analyticsLifecycleEvent.findUnique({
      where: { eventId: validated.eventId },
    });
    if (existing) {
      return;
    }

    await this.database.analyticsLifecycleEvent.create({
      data: {
        eventId: validated.eventId,
        eventType: validated.eventType,
        eventVersion: validated.eventVersion,
        opaqueSubjectId: validated.opaqueSubjectId,
        subjectType: validated.subjectType,
        occurredAt: new Date(validated.occurredAt),
        isSandbox: validated.isSandbox,
        isTestAccount: validated.isTestAccount,
        payload: validated.payload as Prisma.InputJsonValue,
      },
    });
  }

  async getMetricsSummary(
    query: StaffPeriodQuery,
  ): Promise<StaffMetricsSummaryResponse> {
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException("Invalid date range specified.");
    }
    if (startDate.getTime() > endDate.getTime()) {
      throw new BadRequestException("Start date must be before end date.");
    }

    // Query events up to period end for durable reconstruction
    const dbEvents = await this.database.analyticsLifecycleEvent.findMany({
      where: {
        occurredAt: {
          lte: endDate,
        },
      },
      orderBy: { occurredAt: "asc" },
    });

    const rawEvents: RawAnalyticsEvent[] = dbEvents.map((e) => ({
      id: e.id,
      eventId: e.eventId,
      eventType: e.eventType,
      eventVersion: e.eventVersion,
      opaqueSubjectId: e.opaqueSubjectId,
      subjectType: e.subjectType as "USER" | "HOUSEHOLD",
      occurredAt: e.occurredAt,
      isSandbox: e.isSandbox,
      isTestAccount: e.isTestAccount,
      payload: (e.payload as Record<string, unknown>) ?? {},
    }));

    return this.engine.computeMetricsSummary(
      rawEvents,
      startDate,
      endDate,
      query.timezone,
    );
  }

  async getRetentionCohorts(
    query: RetentionCohortQuery,
  ): Promise<StaffRetentionCohortsResponse> {
    const dbEvents = await this.database.analyticsLifecycleEvent.findMany({
      where: {
        eventType: {
          in: ["USER_REGISTERED", "USER_ACTIVATED", "QUALIFYING_ACTIVITY"],
        },
      },
      orderBy: { occurredAt: "asc" },
    });

    const rawEvents: RawAnalyticsEvent[] = dbEvents.map((e) => ({
      id: e.id,
      eventId: e.eventId,
      eventType: e.eventType,
      eventVersion: e.eventVersion,
      opaqueSubjectId: e.opaqueSubjectId,
      subjectType: e.subjectType as "USER" | "HOUSEHOLD",
      occurredAt: e.occurredAt,
      isSandbox: e.isSandbox,
      isTestAccount: e.isTestAccount,
      payload: (e.payload as Record<string, unknown>) ?? {},
    }));

    return this.engine.computeRetentionCohorts(rawEvents, query.maxCohorts);
  }

  async purgeExpiredRawEvents(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date(Date.now() - retentionDays * 86400000);
    const deleteResult = await this.database.analyticsLifecycleEvent.deleteMany(
      {
        where: {
          occurredAt: {
            lt: cutoffDate,
          },
        },
      },
    );
    return deleteResult.count;
  }
}
