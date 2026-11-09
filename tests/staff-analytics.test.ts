import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeEach } from "vitest";
import type {
  StaffMetricsSummaryResponse,
  StaffRetentionCohortsResponse,
} from "../packages/contracts/src/index.js";
import type { PrismaClient } from "../packages/database/dist/client.js";
import {
  AnalyticsMetricsEngine,
  computeOpaqueSubjectId,
  addWeeksToIsoWeek,
  getIsoWeekString,
  type RawAnalyticsEvent,
} from "../apps/api/src/modules/staff/metrics-engine.js";
import { StaffAuthService } from "../apps/api/src/modules/staff/staff-auth.service.js";
import { StaffAnalyticsService } from "../apps/api/src/modules/staff/staff-analytics.service.js";
import { createStaffController } from "../apps/api/src/modules/staff/staff.controller.js";
import type { IdentityAccess } from "../apps/api/src/modules/identity/identity.service.js";

interface MockStaffMember {
  id: string;
  userId: string;
  role: "ANALYTICS_VIEWER" | "STAFF_ADMIN";
  grantedByUserId: string | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockStaffAudit {
  id: bigint;
  staffMemberId: string;
  userId: string;
  action: string;
  targetResource: string | null;
  createdAt: Date;
}

interface MockAnalyticsEvent {
  id: string;
  eventId: string;
  eventType: string;
  eventVersion: number;
  opaqueSubjectId: string;
  subjectType: string;
  occurredAt: Date;
  isSandbox: boolean;
  isTestAccount: boolean;
  payload: Record<string, unknown>;
  createdAt: Date;
}

interface StaffControllerInstance {
  getMetrics: (
    authHeader: string | undefined,
    startDate: string | undefined,
    endDate: string | undefined,
    timezone: string | undefined,
  ) => Promise<StaffMetricsSummaryResponse>;
  getRetentionCohorts: (
    authHeader: string | undefined,
    maxCohorts: string | undefined,
  ) => Promise<StaffRetentionCohortsResponse>;
  recordEvent: (
    authHeader: string | undefined,
    body: unknown,
  ) => Promise<{ received: boolean }>;
}

describe("IOS14 Staff Authorization and Minimal Analytics Collection", () => {
  let mockStaffMembers: MockStaffMember[] = [];
  let mockStaffAudits: MockStaffAudit[] = [];
  let mockAnalyticsEvents: MockAnalyticsEvent[] = [];

  let mockIdentity: {
    actor: (token: string) => Promise<{
      userId: string;
      sessionId: string;
      emailHash: string;
      aal: "aal1" | "aal2";
      authenticatedAt: number | null;
      mfaAuthenticatedAt: number | null;
    }>;
  };

  let mockDatabase: PrismaClient;
  let staffAuthService: StaffAuthService;
  let staffAnalyticsService: StaffAnalyticsService;

  const validStaffUserId = randomUUID();
  const validAdminUserId = randomUUID();
  const regularAdultUserId = randomUUID();
  const purchaserUserId = randomUUID();
  const revokedStaffUserId = randomUUID();
  const multiRoleUserId = randomUUID();

  const sampleOpaqueId = computeOpaqueSubjectId(
    "household_test_1",
    "test_secret_key",
  );
  const sampleAdminOpaqueId = computeOpaqueSubjectId(
    "household_admin_1",
    "test_secret_key",
  );

  beforeEach(() => {
    mockStaffMembers = [
      {
        id: randomUUID(),
        userId: validStaffUserId,
        role: "ANALYTICS_VIEWER",
        grantedByUserId: null,
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: randomUUID(),
        userId: validAdminUserId,
        role: "STAFF_ADMIN",
        grantedByUserId: null,
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: randomUUID(),
        userId: revokedStaffUserId,
        role: "ANALYTICS_VIEWER",
        grantedByUserId: null,
        revokedAt: new Date(Date.now() - 3600000), // Revoked 1 hour ago
        createdAt: new Date(Date.now() - 86400000),
        updatedAt: new Date(),
      },
      {
        id: randomUUID(),
        userId: multiRoleUserId,
        role: "ANALYTICS_VIEWER",
        grantedByUserId: null,
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: randomUUID(),
        userId: multiRoleUserId,
        role: "STAFF_ADMIN",
        grantedByUserId: null,
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    mockStaffAudits = [];
    mockAnalyticsEvents = [];

    mockIdentity = {
      actor: async (token: string) => {
        if (token.includes("token_staff_viewer")) {
          return {
            userId: validStaffUserId,
            sessionId: randomUUID(),
            emailHash: "hash_viewer",
            aal: "aal2",
            authenticatedAt: Date.now(),
            mfaAuthenticatedAt: Date.now(),
          };
        }
        if (token.includes("token_staff_admin")) {
          return {
            userId: validAdminUserId,
            sessionId: randomUUID(),
            emailHash: "hash_admin",
            aal: "aal2",
            authenticatedAt: Date.now(),
            mfaAuthenticatedAt: Date.now(),
          };
        }
        if (token.includes("token_staff_multi_role")) {
          return {
            userId: multiRoleUserId,
            sessionId: randomUUID(),
            emailHash: "hash_multi",
            aal: "aal2",
            authenticatedAt: Date.now(),
            mfaAuthenticatedAt: Date.now(),
          };
        }
        if (token.includes("token_regular_adult")) {
          return {
            userId: regularAdultUserId,
            sessionId: randomUUID(),
            emailHash: "hash_adult",
            aal: "aal1",
            authenticatedAt: Date.now(),
            mfaAuthenticatedAt: null,
          };
        }
        if (token.includes("token_purchaser")) {
          return {
            userId: purchaserUserId,
            sessionId: randomUUID(),
            emailHash: "hash_purchaser",
            aal: "aal1",
            authenticatedAt: Date.now(),
            mfaAuthenticatedAt: null,
          };
        }
        if (token.includes("token_revoked_staff")) {
          return {
            userId: revokedStaffUserId,
            sessionId: randomUUID(),
            emailHash: "hash_revoked",
            aal: "aal2",
            authenticatedAt: Date.now(),
            mfaAuthenticatedAt: Date.now(),
          };
        }
        throw new Error("Invalid session token.");
      },
    };

    mockDatabase = {
      staffMember: {
        findMany: async (args: {
          where: { userId: string; revokedAt: Date | null };
        }) => {
          const { userId, revokedAt } = args.where;
          return mockStaffMembers.filter((m) => {
            if (m.userId !== userId) return false;
            if (revokedAt === null && m.revokedAt !== null) return false;
            return true;
          });
        },
        findFirst: async (args: {
          where: { userId: string; revokedAt: Date | null };
        }) => {
          const { userId, revokedAt } = args.where;
          const member = mockStaffMembers.find((m) => {
            if (m.userId !== userId) return false;
            if (revokedAt === null && m.revokedAt !== null) return false;
            return true;
          });
          return member ?? null;
        },
      },
      staffAudit: {
        create: async (args: {
          data: {
            staffMemberId: string;
            userId: string;
            action: string;
            targetResource?: string | null;
          };
        }) => {
          const audit: MockStaffAudit = {
            id: BigInt(mockStaffAudits.length + 1),
            staffMemberId: args.data.staffMemberId,
            userId: args.data.userId,
            action: args.data.action,
            targetResource: args.data.targetResource ?? null,
            createdAt: new Date(),
          };
          mockStaffAudits.push(audit);
          return audit;
        },
      },
      analyticsLifecycleEvent: {
        findUnique: async (args: { where: { eventId: string } }) => {
          return (
            mockAnalyticsEvents.find((e) => e.eventId === args.where.eventId) ??
            null
          );
        },
        findMany: async (args?: {
          where?: {
            occurredAt?: { lte?: Date };
            eventType?: { in?: string[] };
          };
        }) => {
          let list = [...mockAnalyticsEvents];
          if (args?.where?.occurredAt?.lte) {
            const maxDate = new Date(args.where.occurredAt.lte).getTime();
            list = list.filter((e) => e.occurredAt.getTime() <= maxDate);
          }
          if (args?.where?.eventType?.in) {
            const types = new Set(args.where.eventType.in);
            list = list.filter((e) => types.has(e.eventType));
          }
          list.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
          return list;
        },
        create: async (args: {
          data: {
            eventId: string;
            eventType: string;
            eventVersion?: number;
            opaqueSubjectId: string;
            subjectType: string;
            occurredAt: Date;
            isSandbox?: boolean;
            isTestAccount?: boolean;
            payload: Record<string, unknown>;
          };
        }) => {
          const ev: MockAnalyticsEvent = {
            id: randomUUID(),
            eventId: args.data.eventId,
            eventType: args.data.eventType,
            eventVersion: args.data.eventVersion ?? 1,
            opaqueSubjectId: args.data.opaqueSubjectId,
            subjectType: args.data.subjectType,
            occurredAt: args.data.occurredAt,
            isSandbox: args.data.isSandbox ?? false,
            isTestAccount: args.data.isTestAccount ?? false,
            payload: args.data.payload,
            createdAt: new Date(),
          };
          mockAnalyticsEvents.push(ev);
          return ev;
        },
        deleteMany: async (args: { where: { occurredAt: { lt: Date } } }) => {
          const cutoff = new Date(args.where.occurredAt.lt).getTime();
          const initialLen = mockAnalyticsEvents.length;
          mockAnalyticsEvents = mockAnalyticsEvents.filter(
            (e) => e.occurredAt.getTime() >= cutoff,
          );
          return { count: initialLen - mockAnalyticsEvents.length };
        },
      },
    } as unknown as PrismaClient;

    staffAuthService = new StaffAuthService(
      mockDatabase,
      mockIdentity as unknown as IdentityAccess,
    );
    staffAnalyticsService = new StaffAnalyticsService(mockDatabase);
  });

  describe("1. Staff Role and API Boundary", () => {
    it("denies unauthenticated requests missing bearer token", async () => {
      await expect(
        staffAuthService.authenticateStaff(undefined),
      ).rejects.toThrow();
    });

    it("denies regular adult household members lacking staff authority", async () => {
      await expect(
        staffAuthService.authenticateStaff(
          "Bearer eyJhbGci.token_regular_adult.sig",
        ),
      ).rejects.toThrow(/Explicit staff authority required/);
    });

    it("denies purchasers lacking explicit staff authority", async () => {
      await expect(
        staffAuthService.authenticateStaff(
          "Bearer eyJhbGci.token_purchaser.sig",
        ),
      ).rejects.toThrow(/Explicit staff authority required/);
    });

    it("denies revoked staff members immediately", async () => {
      await expect(
        staffAuthService.authenticateStaff(
          "Bearer eyJhbGci.token_revoked_staff.sig",
        ),
      ).rejects.toThrow(/Explicit staff authority required/);
    });

    it("accepts active staff members and logs immutable audit record", async () => {
      const context = await staffAuthService.authenticateStaff(
        "Bearer eyJhbGci.token_staff_viewer.sig",
        "TEST_QUERY",
        "METRICS",
      );

      expect(context.userId).toBe(validStaffUserId);
      expect(context.role).toBe("ANALYTICS_VIEWER");
      expect(mockStaffAudits).toHaveLength(1);
      expect(mockStaffAudits[0]?.action).toBe("TEST_QUERY");
      expect(mockStaffAudits[0]?.targetResource).toBe("METRICS");
    });

    it("resolves multi-role staff deterministically to highest privilege (STAFF_ADMIN)", async () => {
      const context = await staffAuthService.authenticateStaff(
        "Bearer eyJhbGci.token_staff_multi_role.sig",
        "TEST_QUERY",
        "METRICS",
      );

      expect(context.userId).toBe(multiRoleUserId);
      expect(context.role).toBe("STAFF_ADMIN");
    });
  });

  describe("2. Sensitive Financial Payload Rejection", () => {
    it("rejects non-64-character hex opaqueSubjectId", async () => {
      await expect(
        staffAnalyticsService.recordEvent({
          eventId: "evt_invalid_opaque_1",
          eventType: "SUBSCRIPTION_STARTED",
          opaqueSubjectId: "123e4567-e89b-12d3-a456-426614174000", // UUID format
          subjectType: "HOUSEHOLD",
          occurredAt: new Date().toISOString(),
          payload: {
            planTier: "STANDARD_MONTHLY",
          },
        }),
      ).rejects.toThrow(/64-character.*hexadecimal/);
    });

    it("rejects events carrying bank account numbers or sort codes", async () => {
      await expect(
        staffAnalyticsService.recordEvent({
          eventId: "evt_invalid_1",
          eventType: "SUBSCRIPTION_STARTED",
          opaqueSubjectId: sampleOpaqueId,
          subjectType: "HOUSEHOLD",
          occurredAt: new Date().toISOString(),
          payload: {
            planTier: "STANDARD_MONTHLY",
            accountNumber: "12345678",
          },
        }),
      ).rejects.toThrow(
        /Sensitive financial attribute 'accountNumber' is prohibited/,
      );
    });

    it("rejects events carrying bank balances", async () => {
      await expect(
        staffAnalyticsService.recordEvent({
          eventId: "evt_invalid_2",
          eventType: "SUBSCRIPTION_STARTED",
          opaqueSubjectId: sampleOpaqueId,
          subjectType: "HOUSEHOLD",
          occurredAt: new Date().toISOString(),
          payload: {
            planTier: "STANDARD_MONTHLY",
            balance: 50000,
          },
        }),
      ).rejects.toThrow(
        /Sensitive financial attribute 'balance' is prohibited/,
      );
    });

    it("rejects events carrying transaction descriptions or merchants", async () => {
      await expect(
        staffAnalyticsService.recordEvent({
          eventId: "evt_invalid_3",
          eventType: "SUBSCRIPTION_STARTED",
          opaqueSubjectId: sampleOpaqueId,
          subjectType: "HOUSEHOLD",
          occurredAt: new Date().toISOString(),
          payload: {
            description: "Waitrose supermarket grocery",
          },
        }),
      ).rejects.toThrow(
        /Sensitive financial attribute 'description' is prohibited/,
      );
    });

    it("rejects events carrying compound sensitive keys", async () => {
      await expect(
        staffAnalyticsService.recordEvent({
          eventId: "evt_invalid_compound_1",
          eventType: "SUBSCRIPTION_STARTED",
          opaqueSubjectId: sampleOpaqueId,
          subjectType: "HOUSEHOLD",
          occurredAt: new Date().toISOString(),
          payload: {
            merchant_name: "Tesco Express",
          },
        }),
      ).rejects.toThrow(
        /Sensitive financial attribute 'merchant_name' is prohibited/,
      );

      await expect(
        staffAnalyticsService.recordEvent({
          eventId: "evt_invalid_compound_2",
          eventType: "SUBSCRIPTION_STARTED",
          opaqueSubjectId: sampleOpaqueId,
          subjectType: "HOUSEHOLD",
          occurredAt: new Date().toISOString(),
          payload: {
            bank_balance_minor: 12000,
          },
        }),
      ).rejects.toThrow(
        /Sensitive financial attribute 'bank_balance_minor' is prohibited/,
      );
    });

    it("rejects events carrying sensitive attributes nested inside arrays", async () => {
      await expect(
        staffAnalyticsService.recordEvent({
          eventId: "evt_invalid_array_1",
          eventType: "SUBSCRIPTION_STARTED",
          opaqueSubjectId: sampleOpaqueId,
          subjectType: "HOUSEHOLD",
          occurredAt: new Date().toISOString(),
          payload: {
            batch: [
              { okField: 1 },
              { innerList: [{ merchantName: "Amazon UK" }] },
            ],
          },
        }),
      ).rejects.toThrow(
        /Sensitive financial attribute 'merchantName' is prohibited/,
      );
    });

    it("rejects events carrying user prompts", async () => {
      await expect(
        staffAnalyticsService.recordEvent({
          eventId: "evt_invalid_4",
          eventType: "SUBSCRIPTION_STARTED",
          opaqueSubjectId: sampleOpaqueId,
          subjectType: "HOUSEHOLD",
          occurredAt: new Date().toISOString(),
          payload: {
            prompt: "What is my spending this month?",
          },
        }),
      ).rejects.toThrow(/Sensitive financial attribute 'prompt' is prohibited/);
    });

    it("accepts valid opaque commercial lifecycle events", async () => {
      await staffAnalyticsService.recordEvent({
        eventId: "evt_valid_1",
        eventType: "SUBSCRIPTION_STARTED",
        opaqueSubjectId: sampleOpaqueId,
        subjectType: "HOUSEHOLD",
        occurredAt: new Date().toISOString(),
        payload: {
          planTier: "STANDARD_MONTHLY",
          billingInterval: "MONTH",
          priceMinor: 499,
          currency: "GBP",
        },
      });

      expect(mockAnalyticsEvents).toHaveLength(1);
      expect(mockAnalyticsEvents[0]?.eventId).toBe("evt_valid_1");
    });

    it("idempotently ignores duplicate event IDs without creating duplicate records", async () => {
      const eventInput = {
        eventId: "evt_dedup_1",
        eventType: "SUBSCRIPTION_STARTED",
        opaqueSubjectId: sampleOpaqueId,
        subjectType: "HOUSEHOLD" as const,
        occurredAt: new Date().toISOString(),
        payload: {
          planTier: "STANDARD_MONTHLY",
          billingInterval: "MONTH",
          priceMinor: 499,
          currency: "GBP",
        },
      };

      await staffAnalyticsService.recordEvent(eventInput);
      await staffAnalyticsService.recordEvent(eventInput);

      expect(mockAnalyticsEvents).toHaveLength(1);
    });
  });

  describe("3. Metric Definitions and Pure Calculation Engine", () => {
    const engine = new AnalyticsMetricsEngine({ suppressionThreshold: 5 });
    const periodStart = new Date("2026-10-01T00:00:00.000Z");
    const periodEnd = new Date("2026-10-31T23:59:59.999Z");

    it("computes MRR with monthly and annual plans (annual divided by 12)", () => {
      const events: RawAnalyticsEvent[] = [
        // Household 1: Monthly 4.99 GBP (499 pence)
        {
          id: "1",
          eventId: "sub_1",
          eventType: "SUBSCRIPTION_STARTED",
          eventVersion: 1,
          opaqueSubjectId: "hh_1",
          subjectType: "HOUSEHOLD",
          occurredAt: new Date("2026-10-05T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: {
            planTier: "STANDARD_MONTHLY",
            billingInterval: "MONTH",
            priceMinor: 499,
          },
        },
        // Household 2: Annual 49.99 GBP (4999 pence) -> MRR = round(4999 / 12) = 417 pence
        {
          id: "2",
          eventId: "sub_2",
          eventType: "SUBSCRIPTION_STARTED",
          eventVersion: 1,
          opaqueSubjectId: "hh_2",
          subjectType: "HOUSEHOLD",
          occurredAt: new Date("2026-10-10T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: {
            planTier: "STANDARD_ANNUAL",
            billingInterval: "YEAR",
            priceMinor: 4999,
          },
        },
      ];

      const summary = engine.computeMetricsSummary(
        events,
        periodStart,
        periodEnd,
      );

      expect(summary.activePaidHouseholds).toBe(2);
      // MRR = 499 + 417 = 916 pence
      expect(summary.mrrMinor).toBe(916);
      expect(summary.grossCollectedMinor).toBe(499 + 4999);
      expect(summary.netCollectedRevenueMinor).toBe(499 + 4999);
    });

    it("excludes sandbox and test accounts from commercial metrics", () => {
      const events: RawAnalyticsEvent[] = [
        // Real production subscriber
        {
          id: "1",
          eventId: "sub_prod",
          eventType: "SUBSCRIPTION_STARTED",
          eventVersion: 1,
          opaqueSubjectId: "hh_real",
          subjectType: "HOUSEHOLD",
          occurredAt: new Date("2026-10-05T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: {
            planTier: "STANDARD_MONTHLY",
            billingInterval: "MONTH",
            priceMinor: 499,
          },
        },
        // Sandbox test subscriber (StoreKit / Google Play sandbox)
        {
          id: "2",
          eventId: "sub_sandbox",
          eventType: "SUBSCRIPTION_STARTED",
          eventVersion: 1,
          opaqueSubjectId: "hh_sandbox",
          subjectType: "HOUSEHOLD",
          occurredAt: new Date("2026-10-05T12:00:00Z"),
          isSandbox: true,
          isTestAccount: false,
          payload: {
            planTier: "STANDARD_MONTHLY",
            billingInterval: "MONTH",
            priceMinor: 499,
          },
        },
        // Test account
        {
          id: "3",
          eventId: "sub_test_acc",
          eventType: "SUBSCRIPTION_STARTED",
          eventVersion: 1,
          opaqueSubjectId: "hh_test",
          subjectType: "HOUSEHOLD",
          occurredAt: new Date("2026-10-05T12:00:00Z"),
          isSandbox: false,
          isTestAccount: true,
          payload: {
            planTier: "STANDARD_MONTHLY",
            billingInterval: "MONTH",
            priceMinor: 499,
          },
        },
      ];

      const summary = engine.computeMetricsSummary(
        events,
        periodStart,
        periodEnd,
      );

      expect(summary.activePaidHouseholds).toBe(1);
      expect(summary.mrrMinor).toBe(499);
      expect(summary.grossCollectedMinor).toBe(499);
    });

    it("computes paying-household churn accurately with late refunds and period boundaries", () => {
      const events: RawAnalyticsEvent[] = [
        // Household A started before periodStart
        {
          id: "1",
          eventId: "sub_a",
          eventType: "SUBSCRIPTION_STARTED",
          eventVersion: 1,
          opaqueSubjectId: "hh_a",
          subjectType: "HOUSEHOLD",
          occurredAt: new Date("2026-09-15T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: {
            planTier: "STANDARD_MONTHLY",
            billingInterval: "MONTH",
            priceMinor: 499,
          },
        },
        // Household B started before periodStart
        {
          id: "2",
          eventId: "sub_b",
          eventType: "SUBSCRIPTION_STARTED",
          eventVersion: 1,
          opaqueSubjectId: "hh_b",
          subjectType: "HOUSEHOLD",
          occurredAt: new Date("2026-09-20T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: {
            planTier: "STANDARD_MONTHLY",
            billingInterval: "MONTH",
            priceMinor: 499,
          },
        },
        // Household A expires during October
        {
          id: "3",
          eventId: "exp_a",
          eventType: "SUBSCRIPTION_EXPIRED",
          eventVersion: 1,
          opaqueSubjectId: "hh_a",
          subjectType: "HOUSEHOLD",
          occurredAt: new Date("2026-10-15T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: {},
        },
        // Household C joins mid-period in October
        {
          id: "4",
          eventId: "sub_c",
          eventType: "SUBSCRIPTION_STARTED",
          eventVersion: 1,
          opaqueSubjectId: "hh_c",
          subjectType: "HOUSEHOLD",
          occurredAt: new Date("2026-10-20T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: {
            planTier: "STANDARD_MONTHLY",
            billingInterval: "MONTH",
            priceMinor: 499,
          },
        },
        // Late refund for Household A
        {
          id: "5",
          eventId: "ref_a",
          eventType: "REFUND_ISSUED",
          eventVersion: 1,
          opaqueSubjectId: "hh_a",
          subjectType: "HOUSEHOLD",
          occurredAt: new Date("2026-10-16T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: {
            refundAmountMinor: 499,
            currency: "GBP",
          },
        },
      ];

      const summary = engine.computeMetricsSummary(
        events,
        periodStart,
        periodEnd,
      );

      // Start paid count = 2 (hh_a, hh_b). Lost count = 1 (hh_a expired).
      // Churn rate = 1 / 2 = 0.5 (50%)
      expect(summary.payingHouseholdChurn.startCount).toBe(2);
      expect(summary.payingHouseholdChurn.lostCount).toBe(1);
      expect(summary.payingHouseholdChurn.churnRate).toBe(0.5);
      expect(summary.payingHouseholdChurn.denominatorZero).toBe(false);

      // End active paid households = 2 (hh_b, hh_c)
      expect(summary.activePaidHouseholds).toBe(2);

      // Refunds and Net revenue
      expect(summary.grossCollectedMinor).toBe(499); // Only hh_c collected in Oct
      expect(summary.refundsMinor).toBe(499); // hh_a refund
      expect(summary.netCollectedRevenueMinor).toBe(0);
    });

    it("handles zero denominator in paying-household churn gracefully", () => {
      const summary = engine.computeMetricsSummary([], periodStart, periodEnd);
      expect(summary.payingHouseholdChurn.startCount).toBe(0);
      expect(summary.payingHouseholdChurn.lostCount).toBe(0);
      expect(summary.payingHouseholdChurn.churnRate).toBe(0.0);
      expect(summary.payingHouseholdChurn.denominatorZero).toBe(true);
    });

    it("computes user activation and turnover excluding later signups from turnover cohort", () => {
      const events: RawAnalyticsEvent[] = [
        // User 1 registered before period (in start cohort)
        {
          id: "1",
          eventId: "reg_u1",
          eventType: "USER_REGISTERED",
          eventVersion: 1,
          opaqueSubjectId: "u_1",
          subjectType: "USER",
          occurredAt: new Date("2026-09-10T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: {},
        },
        // User 2 registered before period (in start cohort)
        {
          id: "2",
          eventId: "reg_u2",
          eventType: "USER_REGISTERED",
          eventVersion: 1,
          opaqueSubjectId: "u_2",
          subjectType: "USER",
          occurredAt: new Date("2026-09-15T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: {},
        },
        // User 1 deleted during October
        {
          id: "3",
          eventId: "del_u1",
          eventType: "USER_DELETED",
          eventVersion: 1,
          opaqueSubjectId: "u_1",
          subjectType: "USER",
          occurredAt: new Date("2026-10-10T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: {},
        },
        // User 3 registered in October
        {
          id: "4",
          eventId: "reg_u3",
          eventType: "USER_REGISTERED",
          eventVersion: 1,
          opaqueSubjectId: "u_3",
          subjectType: "USER",
          occurredAt: new Date("2026-10-05T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: {},
        },
        // User 3 activated in October
        {
          id: "5",
          eventId: "act_u3",
          eventType: "USER_ACTIVATED",
          eventVersion: 1,
          opaqueSubjectId: "u_3",
          subjectType: "USER",
          occurredAt: new Date("2026-10-06T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: {},
        },
        // User 4 registered in October but did not activate
        {
          id: "6",
          eventId: "reg_u4",
          eventType: "USER_REGISTERED",
          eventVersion: 1,
          opaqueSubjectId: "u_4",
          subjectType: "USER",
          occurredAt: new Date("2026-10-12T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: {},
        },
        // User 4 deleted in October (joined during period, must be excluded from start turnover cohort!)
        {
          id: "7",
          eventId: "del_u4",
          eventType: "USER_DELETED",
          eventVersion: 1,
          opaqueSubjectId: "u_4",
          subjectType: "USER",
          occurredAt: new Date("2026-10-25T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: {},
        },
      ];

      const summary = engine.computeMetricsSummary(
        events,
        periodStart,
        periodEnd,
      );

      // Activation: 2 registered in Oct (u3, u4), 1 activated (u3) -> rate = 0.5
      expect(summary.userActivation.registeredCount).toBe(2);
      expect(summary.userActivation.activatedCount).toBe(1);
      expect(summary.userActivation.activationRate).toBe(0.5);
      expect(summary.userActivation.denominatorZero).toBe(false);

      // Turnover: start cohort = 2 (u1, u2). Deletions from start cohort = 1 (u1).
      // u4 was registered after period start and is excluded from start cohort turnover!
      expect(summary.userTurnover.startCohortCount).toBe(2);
      expect(summary.userTurnover.deletedFromStartCohortCount).toBe(1);
      expect(summary.userTurnover.turnoverRate).toBe(0.5);
      expect(summary.userTurnover.denominatorZero).toBe(false);
    });

    it("handles zero denominator in user activation and turnover", () => {
      const summary = engine.computeMetricsSummary([], periodStart, periodEnd);
      expect(summary.userActivation.denominatorZero).toBe(true);
      expect(summary.userActivation.activationRate).toBe(0.0);
      expect(summary.userTurnover.denominatorZero).toBe(true);
      expect(summary.userTurnover.turnoverRate).toBe(0.0);
    });
  });

  describe("4. Retention Cohorts and Server-Side Cell Suppression (< 5 Threshold)", () => {
    const engine = new AnalyticsMetricsEngine({ suppressionThreshold: 5 });

    it("suppresses entire cohort when cohort size is below 5", () => {
      // 3 users in cohort 2026-W40
      const events: RawAnalyticsEvent[] = [
        {
          id: "1",
          eventId: "e1",
          eventType: "USER_REGISTERED",
          eventVersion: 1,
          opaqueSubjectId: "u_1",
          subjectType: "USER",
          occurredAt: new Date("2026-10-01T12:00:00Z"), // W40
          isSandbox: false,
          isTestAccount: false,
          payload: {},
        },
        {
          id: "2",
          eventId: "e2",
          eventType: "USER_REGISTERED",
          eventVersion: 1,
          opaqueSubjectId: "u_2",
          subjectType: "USER",
          occurredAt: new Date("2026-10-01T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: {},
        },
        {
          id: "3",
          eventId: "e3",
          eventType: "USER_REGISTERED",
          eventVersion: 1,
          opaqueSubjectId: "u_3",
          subjectType: "USER",
          occurredAt: new Date("2026-10-01T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: {},
        },
      ];

      const result = engine.computeRetentionCohorts(events, 4);

      expect(result.cohorts).toHaveLength(1);
      const cohort = result.cohorts[0]!;
      expect(cohort.cohortSizeSuppressed).toBe(true);
      expect(cohort.cohortSize).toBeUndefined(); // Suppressed count not leaked to client
      for (const cell of cohort.cells) {
        expect(cell.suppressed).toBe(true);
        expect(cell.activeUsers).toBeUndefined();
        expect(cell.retentionRate).toBeUndefined();
      }
    });

    it("displays cohort size when >= 5 but suppresses individual cell activity below 5", () => {
      // 6 users in cohort 2026-W40
      const events: RawAnalyticsEvent[] = [];
      for (let i = 1; i <= 6; i++) {
        events.push({
          id: `reg_${i}`,
          eventId: `reg_ev_${i}`,
          eventType: "USER_REGISTERED",
          eventVersion: 1,
          opaqueSubjectId: `user_${i}`,
          subjectType: "USER",
          occurredAt: new Date("2026-10-01T12:00:00Z"), // 2026-W40
          isSandbox: false,
          isTestAccount: false,
          payload: {},
        });
      }

      // In Week 0 (2026-W40): all 6 users have qualifying activity
      for (let i = 1; i <= 6; i++) {
        events.push({
          id: `act0_${i}`,
          eventId: `act0_ev_${i}`,
          eventType: "QUALIFYING_ACTIVITY",
          eventVersion: 1,
          opaqueSubjectId: `user_${i}`,
          subjectType: "USER",
          occurredAt: new Date("2026-10-02T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: { activityWeek: "2026-W40" },
        });
      }

      // In Week 1 (2026-W41): only 3 users have qualifying activity (< 5 threshold)
      for (let i = 1; i <= 3; i++) {
        events.push({
          id: `act1_${i}`,
          eventId: `act1_ev_${i}`,
          eventType: "QUALIFYING_ACTIVITY",
          eventVersion: 1,
          opaqueSubjectId: `user_${i}`,
          subjectType: "USER",
          occurredAt: new Date("2026-10-09T12:00:00Z"),
          isSandbox: false,
          isTestAccount: false,
          payload: { activityWeek: "2026-W41" },
        });
      }

      const result = engine.computeRetentionCohorts(events, 4);

      expect(result.cohorts).toHaveLength(1);
      const cohort = result.cohorts[0]!;
      expect(cohort.cohortSizeSuppressed).toBe(false);
      expect(cohort.cohortSize).toBe(6);

      // Week 0: 6 active users >= 5 threshold -> unsuppressed
      const week0 = cohort.cells.find((c) => c.weekIndex === 0)!;
      expect(week0.suppressed).toBe(false);
      expect(week0.activeUsers).toBe(6);
      expect(week0.retentionRate).toBe(1.0);

      // Week 1: 3 active users < 5 threshold -> suppressed
      const week1 = cohort.cells.find((c) => c.weekIndex === 1)!;
      expect(week1.suppressed).toBe(true);
      expect(week1.activeUsers).toBeUndefined();
      expect(week1.retentionRate).toBeUndefined();
    });

    it("excludes sandbox events from retention cohorts", () => {
      const events: RawAnalyticsEvent[] = [];
      // 5 sandbox users in cohort 2026-W40
      for (let i = 1; i <= 5; i++) {
        events.push({
          id: `sbx_reg_${i}`,
          eventId: `sbx_reg_ev_${i}`,
          eventType: "USER_REGISTERED",
          eventVersion: 1,
          opaqueSubjectId: `sbx_user_${i}`,
          subjectType: "USER",
          occurredAt: new Date("2026-10-01T12:00:00Z"),
          isSandbox: true,
          isTestAccount: false,
          payload: {},
        });
      }

      const result = engine.computeRetentionCohorts(events, 4);
      expect(result.cohorts).toHaveLength(0);
    });

    it("computes ISO week roll-overs accurately across year boundaries", () => {
      // 2026-W52 + 1 week -> 2026-W53
      expect(addWeeksToIsoWeek("2026-W52", 1)).toBe("2026-W53");
      // 2026-W53 + 1 week -> 2027-W01
      expect(addWeeksToIsoWeek("2026-W53", 1)).toBe("2027-W01");
      // 2027-W01 + 1 week -> 2027-W02
      expect(addWeeksToIsoWeek("2027-W01", 1)).toBe("2027-W02");
      // Verify date to ISO week for Jan 4, 2027
      expect(getIsoWeekString(new Date(Date.UTC(2027, 0, 4)))).toBe("2027-W01");
    });
  });

  describe("5. End-to-End Staff Controller Integration", () => {
    it("handles authenticated metrics summary query via controller", async () => {
      const controllerClass = createStaffController({
        auth: staffAuthService,
        analytics: staffAnalyticsService,
      });
      const controller = new (
        controllerClass as unknown as new () => StaffControllerInstance
      )();

      // Seed a test subscription event
      await staffAnalyticsService.recordEvent({
        eventId: "ctrl_evt_1",
        eventType: "SUBSCRIPTION_STARTED",
        opaqueSubjectId: computeOpaqueSubjectId("hh_ctrl_1", "test_secret"),
        subjectType: "HOUSEHOLD",
        occurredAt: "2026-10-10T12:00:00.000Z",
        payload: {
          planTier: "STANDARD_MONTHLY",
          billingInterval: "MONTH",
          priceMinor: 499,
          currency: "GBP",
        },
      });

      const response = await controller.getMetrics(
        "Bearer eyJhbGci.token_staff_viewer.sig",
        "2026-10-01T00:00:00.000Z",
        "2026-10-31T23:59:59.999Z",
        "Europe/London",
      );

      expect(response.activePaidHouseholds).toBe(1);
      expect(response.mrrMinor).toBe(499);
      expect(response.grossCollectedMinor).toBe(499);

      // Verify audit trail targetResource
      const lastAudit = mockStaffAudits[mockStaffAudits.length - 1];
      expect(lastAudit?.action).toBe("VIEW_METRICS_SUMMARY");
      expect(lastAudit?.targetResource).toBe("metrics_summary");
    });

    it("handles retention cohorts query via controller and records targetResource in audit log", async () => {
      const controllerClass = createStaffController({
        auth: staffAuthService,
        analytics: staffAnalyticsService,
      });
      const controller = new (
        controllerClass as unknown as new () => StaffControllerInstance
      )();

      const response = await controller.getRetentionCohorts(
        "Bearer eyJhbGci.token_staff_viewer.sig",
        "4",
      );

      expect(response.suppressionThreshold).toBe(5);
      expect(response.cohorts).toBeDefined();

      const lastAudit = mockStaffAudits[mockStaffAudits.length - 1];
      expect(lastAudit?.action).toBe("VIEW_RETENTION_COHORTS");
      expect(lastAudit?.targetResource).toBe("retention_cohorts");
    });

    it("rejects non-admin staff from ingesting events via HTTP endpoint", async () => {
      const controllerClass = createStaffController({
        auth: staffAuthService,
        analytics: staffAnalyticsService,
      });
      const controller = new (
        controllerClass as unknown as new () => StaffControllerInstance
      )();

      await expect(
        controller.recordEvent("Bearer eyJhbGci.token_staff_viewer.sig", {
          eventId: "ctrl_evt_2",
          eventType: "SUBSCRIPTION_STARTED",
          opaqueSubjectId: sampleOpaqueId,
          subjectType: "HOUSEHOLD",
          occurredAt: new Date().toISOString(),
          payload: {
            planTier: "STANDARD_MONTHLY",
            billingInterval: "MONTH",
            priceMinor: 499,
            currency: "GBP",
          },
        }),
      ).rejects.toThrow(/Admin staff privileges required/);
    });

    it("allows staff admin to ingest valid events via HTTP endpoint and records targetResource", async () => {
      const controllerClass = createStaffController({
        auth: staffAuthService,
        analytics: staffAnalyticsService,
      });
      const controller = new (
        controllerClass as unknown as new () => StaffControllerInstance
      )();

      const result = await controller.recordEvent(
        "Bearer eyJhbGci.token_staff_admin.sig",
        {
          eventId: "ctrl_evt_3",
          eventType: "SUBSCRIPTION_STARTED",
          opaqueSubjectId: sampleAdminOpaqueId,
          subjectType: "HOUSEHOLD",
          occurredAt: new Date().toISOString(),
          payload: {
            planTier: "STANDARD_MONTHLY",
            billingInterval: "MONTH",
            priceMinor: 499,
            currency: "GBP",
          },
        },
      );

      expect(result.received).toBe(true);

      const lastAudit = mockStaffAudits[mockStaffAudits.length - 1];
      expect(lastAudit?.action).toBe("INGEST_ANALYTICS_EVENT");
      expect(lastAudit?.targetResource).toBe("analytics_events");
    });
  });

  describe("6. Bounded Retention and Purging", () => {
    it("purges raw analytics events older than retention cutoff (90 days)", async () => {
      const oldDate = new Date(Date.now() - 100 * 86400000); // 100 days old
      const freshDate = new Date(Date.now() - 10 * 86400000); // 10 days old

      mockAnalyticsEvents = [
        {
          id: "old_1",
          eventId: "evt_old_1",
          eventType: "USER_REGISTERED",
          eventVersion: 1,
          opaqueSubjectId: "u_old",
          subjectType: "USER",
          occurredAt: oldDate,
          isSandbox: false,
          isTestAccount: false,
          payload: {},
          createdAt: oldDate,
        },
        {
          id: "fresh_1",
          eventId: "evt_fresh_1",
          eventType: "USER_REGISTERED",
          eventVersion: 1,
          opaqueSubjectId: "u_fresh",
          subjectType: "USER",
          occurredAt: freshDate,
          isSandbox: false,
          isTestAccount: false,
          payload: {},
          createdAt: freshDate,
        },
      ];

      const purgedCount = await staffAnalyticsService.purgeExpiredRawEvents(90);

      expect(purgedCount).toBe(1);
      expect(mockAnalyticsEvents).toHaveLength(1);
      expect(mockAnalyticsEvents[0]?.id).toBe("fresh_1");
    });
  });
});
