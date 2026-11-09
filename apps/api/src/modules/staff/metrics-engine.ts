import { createHmac } from "node:crypto";
import type {
  ActivationMetric,
  ChurnMetric,
  PromotionalDiscount,
  RetentionCohortRow,
  StaffMetricsSummaryResponse,
  StaffRetentionCohortsResponse,
  TurnoverMetric,
} from "@joint/contracts";

export interface RawAnalyticsEvent {
  id: string;
  eventId: string;
  eventType: string;
  eventVersion: number;
  opaqueSubjectId: string;
  subjectType: "USER" | "HOUSEHOLD";
  occurredAt: Date;
  isSandbox: boolean;
  isTestAccount: boolean;
  payload: Record<string, unknown>;
}

export function computeOpaqueSubjectId(
  internalId: string,
  secretKey: string,
): string {
  return createHmac("sha256", secretKey).update(internalId).digest("hex");
}

export interface MetricEngineOptions {
  suppressionThreshold?: number;
}

export class AnalyticsMetricsEngine {
  private readonly suppressionThreshold: number;

  constructor(options?: MetricEngineOptions) {
    this.suppressionThreshold = options?.suppressionThreshold ?? 5;
  }

  computeMetricsSummary(
    events: RawAnalyticsEvent[],
    startDate: Date,
    endDate: Date,
    timezone: string = "Europe/London",
  ): StaffMetricsSummaryResponse {
    const periodStartMs = startDate.getTime();
    const periodEndMs = endDate.getTime();

    // 1. Filter out sandbox and test accounts for commercial revenue metrics
    const productionEvents = events.filter(
      (event) => !event.isSandbox && !event.isTestAccount,
    );

    // Track active paid households at period start and period end
    const householdSubscriptionsAtStart = new Map<
      string,
      {
        planTier: string;
        interval: string;
        priceMinor: number;
        discountMinor: number;
      }
    >();
    const householdSubscriptionsAtEnd = new Map<
      string,
      {
        planTier: string;
        interval: string;
        priceMinor: number;
        discountMinor: number;
      }
    >();

    let grossCollectedMinor = 0;
    let refundsMinor = 0;
    const promotionalDiscounts: PromotionalDiscount[] = [];

    // Replay subscription events up to periodEnd
    const sortedSubEvents = productionEvents
      .filter((e) => e.subjectType === "HOUSEHOLD")
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

    for (const event of sortedSubEvents) {
      const eventTimeMs = event.occurredAt.getTime();
      const householdId = event.opaqueSubjectId;

      if (
        event.eventType === "SUBSCRIPTION_STARTED" ||
        event.eventType === "SUBSCRIPTION_RENEWED"
      ) {
        const payload = event.payload;
        const planTier = String(payload.planTier ?? "STANDARD_MONTHLY");
        const interval = String(payload.billingInterval ?? "MONTH");
        const priceMinor = Number(payload.priceMinor ?? 0);
        const discount = payload.promotionalDiscount as
          PromotionalDiscount | undefined;
        const discountMinor = discount?.discountMinor ?? 0;

        if (
          discount &&
          !promotionalDiscounts.some((d) => d.code === discount.code)
        ) {
          promotionalDiscounts.push(discount);
        }

        // Cash collection during the period
        if (eventTimeMs >= periodStartMs && eventTimeMs <= periodEndMs) {
          grossCollectedMinor += priceMinor;
        }

        // Active tracking
        const subData = { planTier, interval, priceMinor, discountMinor };
        if (eventTimeMs <= periodStartMs) {
          householdSubscriptionsAtStart.set(householdId, subData);
        }
        if (eventTimeMs <= periodEndMs) {
          householdSubscriptionsAtEnd.set(householdId, subData);
        }
      } else if (
        event.eventType === "SUBSCRIPTION_EXPIRED" ||
        event.eventType === "SUBSCRIPTION_CANCELLED"
      ) {
        if (eventTimeMs <= periodStartMs) {
          householdSubscriptionsAtStart.delete(householdId);
        }
        if (eventTimeMs <= periodEndMs) {
          householdSubscriptionsAtEnd.delete(householdId);
        }
      } else if (event.eventType === "REFUND_ISSUED") {
        if (eventTimeMs >= periodStartMs && eventTimeMs <= periodEndMs) {
          const refundAmount = Number(event.payload.refundAmountMinor ?? 0);
          refundsMinor += refundAmount;
        }
      }
    }

    // 2. Active Paid Households at Period End
    const activePaidHouseholds = householdSubscriptionsAtEnd.size;

    // 3. MRR Calculation
    // Monthly equivalent of contracted recurring price after recurring discounts, excluding tax
    // Annual divided by 12
    let mrrMinor = 0;
    for (const sub of householdSubscriptionsAtEnd.values()) {
      const effectivePrice = Math.max(0, sub.priceMinor - sub.discountMinor);
      if (sub.interval === "YEAR" || sub.planTier.includes("ANNUAL")) {
        mrrMinor += Math.round(effectivePrice / 12);
      } else {
        mrrMinor += effectivePrice;
      }
    }

    // 4. Net Collected Revenue
    const netCollectedRevenueMinor = grossCollectedMinor - refundsMinor;

    // 5. Paying-Household Churn
    // (start-of-period paid households losing paid access during period) / (paid households at period start)
    const startPaidCount = householdSubscriptionsAtStart.size;
    let lostPaidCount = 0;
    if (startPaidCount > 0) {
      for (const startHouseholdId of householdSubscriptionsAtStart.keys()) {
        if (!householdSubscriptionsAtEnd.has(startHouseholdId)) {
          lostPaidCount += 1;
        }
      }
    }

    const payingHouseholdChurn: ChurnMetric = {
      startCount: startPaidCount,
      lostCount: lostPaidCount,
      churnRate:
        startPaidCount === 0
          ? 0.0
          : Math.round((lostPaidCount / startPaidCount) * 10000) / 10000,
      denominatorZero: startPaidCount === 0,
    };

    // 6. User Activation & Turnover (using all non-test user events)
    const userEvents = events
      .filter((e) => !e.isTestAccount && e.subjectType === "USER")
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

    // User Activation:
    // (users activated within period) / (users registered within period)
    const registeredInPeriod = new Set<string>();
    const activatedFromPeriodRegistration = new Set<string>();

    // User Turnover:
    // (deletions during period among starting active registered-user cohort) / (active registered users at period start)
    // Exclude users who joined later!
    const activeUsersAtStart = new Set<string>();
    const deletedFromStartCohort = new Set<string>();

    for (const uEvent of userEvents) {
      const uTime = uEvent.occurredAt.getTime();
      const userId = uEvent.opaqueSubjectId;

      if (uEvent.eventType === "USER_REGISTERED") {
        if (uTime < periodStartMs) {
          activeUsersAtStart.add(userId);
        } else if (uTime <= periodEndMs) {
          registeredInPeriod.add(userId);
        }
      } else if (uEvent.eventType === "USER_ACTIVATED") {
        if (
          registeredInPeriod.has(userId) &&
          uTime >= periodStartMs &&
          uTime <= periodEndMs
        ) {
          activatedFromPeriodRegistration.add(userId);
        }
      } else if (uEvent.eventType === "USER_DELETED") {
        if (uTime < periodStartMs) {
          activeUsersAtStart.delete(userId);
        } else if (uTime <= periodEndMs) {
          if (activeUsersAtStart.has(userId)) {
            deletedFromStartCohort.add(userId);
          }
        }
      }
    }

    const userActivation: ActivationMetric = {
      registeredCount: registeredInPeriod.size,
      activatedCount: activatedFromPeriodRegistration.size,
      activationRate:
        registeredInPeriod.size === 0
          ? 0.0
          : Math.round(
              (activatedFromPeriodRegistration.size / registeredInPeriod.size) *
                10000,
            ) / 10000,
      denominatorZero: registeredInPeriod.size === 0,
    };

    const userTurnover: TurnoverMetric = {
      startCohortCount: activeUsersAtStart.size,
      deletedFromStartCohortCount: deletedFromStartCohort.size,
      turnoverRate:
        activeUsersAtStart.size === 0
          ? 0.0
          : Math.round(
              (deletedFromStartCohort.size / activeUsersAtStart.size) * 10000,
            ) / 10000,
      denominatorZero: activeUsersAtStart.size === 0,
    };

    return {
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        timezone,
      },
      activePaidHouseholds,
      mrrMinor,
      grossCollectedMinor,
      refundsMinor,
      netCollectedRevenueMinor,
      promotionalDiscounts,
      payingHouseholdChurn,
      userActivation,
      userTurnover,
      unknownSourceCoverage: false,
    };
  }

  computeRetentionCohorts(
    events: RawAnalyticsEvent[],
    maxCohorts: number = 8,
  ): StaffRetentionCohortsResponse {
    // 1. Group registrations into cohorts by ISO week (e.g. 2026-W40)
    // Strictly exclude sandbox and test accounts to prevent cohort tampering
    const cohortMembers = new Map<string, Set<string>>();
    const userCohortMap = new Map<string, string>();

    const userEvents = events
      .filter(
        (e) => !e.isSandbox && !e.isTestAccount && e.subjectType === "USER",
      )
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

    for (const event of userEvents) {
      const userId = event.opaqueSubjectId;
      if (
        (event.eventType === "USER_REGISTERED" ||
          event.eventType === "USER_ACTIVATED") &&
        !userCohortMap.has(userId)
      ) {
        const cohortWeek = this.getIsoWeekString(event.occurredAt);
        userCohortMap.set(userId, cohortWeek);
        if (!cohortMembers.has(cohortWeek)) {
          cohortMembers.set(cohortWeek, new Set());
        }
        cohortMembers.get(cohortWeek)!.add(userId);
      }
    }

    // 2. Track activity weeks for each user
    const userActivityWeeks = new Map<string, Set<string>>();
    for (const event of userEvents) {
      if (event.eventType === "QUALIFYING_ACTIVITY") {
        const userId = event.opaqueSubjectId;
        const actWeek =
          typeof event.payload.activityWeek === "string"
            ? event.payload.activityWeek
            : this.getIsoWeekString(event.occurredAt);
        if (!userActivityWeeks.has(userId)) {
          userActivityWeeks.set(userId, new Set());
        }
        userActivityWeeks.get(userId)!.add(actWeek);
      }
    }

    // Sort cohort weeks chronologically and take latest maxCohorts
    const sortedWeeks = Array.from(cohortMembers.keys()).sort();
    const targetWeeks = sortedWeeks.slice(-maxCohorts);

    const cohorts: RetentionCohortRow[] = [];

    for (const cohortWeek of targetWeeks) {
      const members = cohortMembers.get(cohortWeek)!;
      const cohortSize = members.size;

      // Server-side suppression rule:
      // Cohort cells below 5 are suppressed server-side
      const isCohortSizeSuppressed = cohortSize < this.suppressionThreshold;

      const cells = [];
      const numWeeksToTrack = 6; // Week 0 to Week 5

      for (let weekOffset = 0; weekOffset < numWeeksToTrack; weekOffset++) {
        const offsetWeekStr = this.addWeeksToIsoWeek(cohortWeek, weekOffset);

        if (isCohortSizeSuppressed) {
          cells.push({
            weekIndex: weekOffset,
            suppressed: true,
          });
        } else {
          // Count active users in this offset week
          let activeCount = 0;
          for (const userId of members) {
            const weeks = userActivityWeeks.get(userId);
            if (weeks && weeks.has(offsetWeekStr)) {
              activeCount += 1;
            }
          }

          // Individual cell suppression check
          if (activeCount < this.suppressionThreshold) {
            cells.push({
              weekIndex: weekOffset,
              suppressed: true,
            });
          } else {
            const retentionRate =
              Math.round((activeCount / cohortSize) * 10000) / 10000;
            cells.push({
              weekIndex: weekOffset,
              suppressed: false,
              activeUsers: activeCount,
              retentionRate,
            });
          }
        }
      }

      cohorts.push({
        cohortWeek,
        cohortSizeSuppressed: isCohortSizeSuppressed,
        cohortSize: isCohortSizeSuppressed ? undefined : cohortSize,
        cells,
      });
    }

    return {
      cohorts,
      suppressionThreshold: 5,
      generatedAt: new Date().toISOString(),
    };
  }

  getIsoWeekString(date: Date): string {
    return getIsoWeekString(date);
  }

  addWeeksToIsoWeek(isoWeek: string, weeksToAdd: number): string {
    return addWeeksToIsoWeek(isoWeek, weeksToAdd);
  }
}

export function getIsoWeekString(date: Date): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function addWeeksToIsoWeek(isoWeek: string, weeksToAdd: number): string {
  if (weeksToAdd === 0) return isoWeek;
  const parts = isoWeek.split("-W");
  const year = Number.parseInt(parts[0] ?? "2026", 10);
  const week = Number.parseInt(parts[1] ?? "1", 10);

  // Anchor to Jan 4, which is guaranteed to be in ISO week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayW1 = new Date(Date.UTC(year, 0, 4 - (jan4Day - 1)));
  mondayW1.setUTCDate(mondayW1.getUTCDate() + (week - 1 + weeksToAdd) * 7);
  return getIsoWeekString(mondayW1);
}
