import { afterAll, expect, it, vi } from "vitest";
import { createFixtureOwner, fixtureTimestamp } from "./fixtures/database.js";
const owner = createFixtureOwner();
const realNow = Date.now;
afterAll(async () => {
  vi.restoreAllMocks();
  await owner.$disconnect();
});
it.each([-1000, 1000])(
  "synthetic MFA freshness stays strict with a %s ms host clock offset",
  async (offset) => {
    const clock = vi
      .spyOn(Date, "now")
      .mockImplementation(() => realNow() + offset);
    try {
      const proof = await fixtureTimestamp(owner);
      expect(proof).toBeLessThanOrEqual(Date.now());
      await owner.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('joint.aal','aal2',true),set_config('joint.mfa_authenticated_at',${String(proof)},true)`;
        expect(
          await tx.$queryRaw`SELECT app.export_fresh_mfa() AS fresh`,
        ).toEqual([{ fresh: true }]);
        await tx.$queryRaw`SELECT set_config('joint.mfa_authenticated_at',${String(proof - 300001)},true)`;
        expect(
          await tx.$queryRaw`SELECT app.export_fresh_mfa() AS fresh`,
        ).toEqual([{ fresh: false }]);
        await tx.$queryRaw`SELECT set_config('joint.mfa_authenticated_at',${String(Date.now() + 60_000)},true)`;
        expect(
          await tx.$queryRaw`SELECT app.export_fresh_mfa() AS fresh`,
        ).toEqual([{ fresh: false }]);
      });
    } finally {
      clock.mockRestore();
    }
  },
);
