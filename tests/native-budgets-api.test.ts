import { describe, expect, it, vi } from "vitest";
import {
  capPosition,
  categoryActual,
} from "../apps/mobile/src/features/budgets/cap-math.js";
import { createSpendingApi } from "../apps/mobile/src/api/spending.js";
import type { NativeTransport } from "../apps/mobile/src/api/types.js";
import type { SpendingReport } from "../packages/contracts/src/index.js";

describe("capPosition domain math", () => {
  it.each([
    ["5000", "3200", "1800", "remaining", 64],
    ["5000", "5000", "0", "reached", 100],
    ["5000", "5800", "-800", "over", 100],
    ["0", "0", "0", "reached", 0],
    ["0", "800", "-800", "over", 100],
    ["5000", "-800", "5800", "remaining", 0],
  ] as const)(
    "cap %s and actual %s yields %s remaining minor and status %s",
    (limit, actual, remaining, status, used) => {
      const result = capPosition(limit, actual);
      expect(result).toMatchObject({
        remainingMinor: remaining,
        status,
        usedPercent: used,
      });
    },
  );

  it("handles numbers beyond Number precision", () => {
    const result = capPosition("9223372036854775807", "9223372036854775808");
    expect(result.remainingMinor).toBe("-1");
    expect(result.status).toBe("over");
  });

  it("calculates withinPercent and overPercent accurately", () => {
    const normal = capPosition("5000", "3200");
    expect(normal.withinPercent).toBe(64);
    expect(normal.overPercent).toBe(0);

    const over = capPosition("5000", "5800");
    expect(over.withinPercent).toBeGreaterThan(86);
    expect(over.withinPercent + over.overPercent).toBe(100);

    const refund = capPosition("5000", "-800");
    expect(refund.withinPercent).toBe(0);
    expect(refund.overPercent).toBe(0);
  });

  it("extracts categoryActual from SpendingReport", () => {
    const mockReport = {
      summary: {
        categories: [
          {
            category: "Groceries",
            grouped: false,
            spending: { amountMinor: "3200", currency: "GBP" },
            count: 3,
          },
          {
            category: "Eating Out",
            grouped: false,
            spending: { amountMinor: "5800", currency: "GBP" },
            count: 5,
          },
        ],
      },
    } as unknown as SpendingReport;

    expect(categoryActual(mockReport, "Groceries")).toEqual({
      amountMinor: "3200",
      currency: "GBP",
    });
    expect(categoryActual(mockReport, "Eating Out")).toEqual({
      amountMinor: "5800",
      currency: "GBP",
    });
    expect(categoryActual(mockReport, "Unknown")).toEqual({
      amountMinor: "0",
      currency: "GBP",
    });
  });
});

describe("createSpendingApi transport adapter", () => {
  const fakeHouseholdId = "11111111-1111-4111-8111-111111111111";
  const fakeAccountId = "22222222-2222-4222-8222-222222222222";

  it("readReport requests spending report with month and accountIds", async () => {
    const mockTransport: NativeTransport = {
      request: vi.fn().mockResolvedValue({ month: "2026-10" }),
      openStatus: vi.fn(),
    };

    const api = createSpendingApi(mockTransport);
    const controller = new AbortController();

    await api.readReport(
      fakeHouseholdId,
      "2026-10",
      [fakeAccountId],
      controller.signal,
    );

    expect(mockTransport.request).toHaveBeenCalledWith(
      `households/${fakeHouseholdId}/reports/spending?month=2026-10&accountIds=${fakeAccountId}`,
      expect.anything(),
      expect.objectContaining({
        method: "GET",
        signal: controller.signal,
      }),
    );
  });

  it("putBudget dispatches PUT with If-Match version and body", async () => {
    const mockTransport: NativeTransport = {
      request: vi
        .fn()
        .mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333" }),
      openStatus: vi.fn(),
    };

    const api = createSpendingApi(mockTransport);
    const controller = new AbortController();

    const body = {
      accountIds: [fakeAccountId],
      lines: [
        {
          category: "Groceries",
          limit: { amountMinor: "5000", currency: "GBP" as const },
        },
      ],
    };

    await api.putBudget(fakeHouseholdId, "2026-10", body, 3, controller.signal);

    expect(mockTransport.request).toHaveBeenCalledWith(
      `households/${fakeHouseholdId}/budgets/2026-10`,
      expect.anything(),
      expect.objectContaining({
        method: "PUT",
        signal: controller.signal,
        body,
        version: 3,
      }),
    );
  });

  it("attestCoverage dispatches PUT with If-Match version and complete flag", async () => {
    const mockTransport: NativeTransport = {
      request: vi.fn().mockResolvedValue({ complete: true, version: 2 }),
      openStatus: vi.fn(),
    };

    const api = createSpendingApi(mockTransport);
    const controller = new AbortController();

    await api.attestCoverage(
      fakeHouseholdId,
      fakeAccountId,
      "2026-10",
      true,
      1,
      controller.signal,
    );

    expect(mockTransport.request).toHaveBeenCalledWith(
      `households/${fakeHouseholdId}/accounts/${fakeAccountId}/coverage/2026-10`,
      expect.anything(),
      expect.objectContaining({
        method: "PUT",
        signal: controller.signal,
        body: { complete: true },
        version: 1,
      }),
    );
  });

  it("categories requests household categories list", async () => {
    const mockTransport: NativeTransport = {
      request: vi.fn().mockResolvedValue({ items: ["Groceries", "Rent"] }),
      openStatus: vi.fn(),
    };

    const api = createSpendingApi(mockTransport);
    const controller = new AbortController();

    await api.categories(fakeHouseholdId, [fakeAccountId], controller.signal);

    expect(mockTransport.request).toHaveBeenCalledWith(
      `households/${fakeHouseholdId}/categories?accountIds=${fakeAccountId}`,
      expect.anything(),
      expect.objectContaining({
        method: "GET",
        signal: controller.signal,
      }),
    );
  });

  it("validates parameters and rejects malformed UUIDs or invalid months", async () => {
    const mockTransport: NativeTransport = {
      request: vi.fn(),
      openStatus: vi.fn(),
    };

    const api = createSpendingApi(mockTransport);

    await expect(api.readReport("not-a-uuid", "2026-10")).rejects.toThrow();

    await expect(
      api.readReport(fakeHouseholdId, "invalid-month"),
    ).rejects.toThrow();
  });
});
