import { createContributionFixture } from "./contribution-budget.js";

export function createLateContributionFixture() {
  const f = createContributionFixture();
  async function setup(): Promise<string> {
    await f.owner.household.create({ data: { id: f.hh } });
    for (const actor of [f.a, f.b]) {
      await f.owner.user.create({ data: { id: actor.userId } });
    }
    await f.owner.membership.create({
      data: {
        id: f.a.membershipId,
        userId: f.a.userId,
        householdId: f.hh,
        slot: 1,
      },
    });
    await f.owner.sessionRegistry.create({
      data: {
        id: f.a.sessionId,
        userId: f.a.userId,
        householdId: f.hh,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const initial = await f.writeCapacity();
    await f.owner.membership.create({
      data: {
        id: f.b.membershipId,
        userId: f.b.userId,
        householdId: f.hh,
        slot: 2,
      },
    });
    await f.owner.sessionRegistry.create({
      data: {
        id: f.b.sessionId,
        userId: f.b.userId,
        householdId: f.hh,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    await f.scoped.withScope(
      f.a,
      (tx) =>
        tx.$queryRaw`SELECT app.write_goal(${f.goalId}::uuid,0,${JSON.stringify(f.goalInput)}::jsonb)`,
    );
    await f.writePlan(1);
    return initial.budget.id;
  }
  return { ...f, setup };
}
