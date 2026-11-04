import { expect, it, vi } from "vitest";
import { readWealthClock } from "../apps/api/src/modules/wealth/wealth-clock.js";

type ClockDatabase = Parameters<typeof readWealthClock>[0];
it("returns the database clock unchanged from one production statement", async () => {
  const clock = {
    today: "2026-03-29",
    now: new Date("2026-03-29T00:30:00.000Z"),
    nextChangeAt: new Date("2026-03-29T23:00:00.000Z"),
  };
  const query = vi.fn<ClockDatabase["$queryRaw"]>().mockResolvedValue([clock]);
  expect(await readWealthClock({ $queryRaw: query })).toBe(clock);
  expect(query).toHaveBeenCalledOnce();
  const [template] = query.mock.calls[0] ?? [];
  expect(template).toHaveLength(1);
  expect(template?.[0]).toContain("statement_timestamp()");
});
it("fails closed if the database clock is unavailable", async () => {
  const query = vi.fn<ClockDatabase["$queryRaw"]>().mockResolvedValue([]);
  await expect(readWealthClock({ $queryRaw: query })).rejects.toThrow(
    "Wealth evaluation clock unavailable",
  );
});
