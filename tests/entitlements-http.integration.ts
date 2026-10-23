import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { entitlementResponseSchema } from "../packages/contracts/dist/index.js";
import { createImportsHttpFixture } from "./fixtures/imports-http.js";

it("serves server authority with no-store and rejects forged client subscription flags", async () => {
  const fixture = await createImportsHttpFixture();
  const grantId = randomUUID();
  const account = await fixture.maintenance.account.findUniqueOrThrow({
    where: { id: fixture.accountId },
  });
  const route = `${fixture.root}/entitlements`;
  try {
    expect((await fixture.request(route, "GET", undefined, "")).status).toBe(
      401,
    );
    expect(
      (await fixture.request(route, "GET", undefined, fixture.outsiderToken))
        .status,
    ).toBe(404);
    const read = await fixture.request(route);
    expect(read.status).toBe(200);
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect(entitlementResponseSchema.parse(await read.json()).plan).toBe(
      "FREE",
    );
    expect((await fixture.request(`${route}?plan=PLUS`)).status).toBe(400);
    await fixture.maintenance
      .$executeRaw`INSERT INTO app."EntitlementGrant" (id,"householdId","membershipId","userId",issuer,reason,"issuedAt","expiresAt",capabilities)
      VALUES (${grantId}::uuid,${account.householdId}::uuid,${account.creatorMembershipId}::uuid,${account.creatorUserId}::uuid,'Synthetic operator','Synthetic HTTP trial',clock_timestamp(),clock_timestamp()+interval '1 day',ARRAY['connections.broker'])`;
    const enabled = entitlementResponseSchema.parse(
      await (await fixture.request(route)).json(),
    );
    expect(enabled).toMatchObject({
      plan: "PLUS",
      caps: {
        bankAuthorisations: 0,
        brokerConnections: 2,
        companionDevices: 0,
      },
    });
    expect(JSON.stringify(enabled)).not.toContain("Synthetic operator");
    expect(JSON.stringify(enabled)).not.toContain(grantId);
    await fixture.maintenance
      .$executeRaw`UPDATE app."EntitlementGrant" SET "revokedAt"=clock_timestamp() WHERE id=${grantId}::uuid`;
    const revoked = entitlementResponseSchema.parse(
      await (await fixture.request(route)).json(),
    );
    expect(revoked.plan).toBe("FREE");
    expect(revoked.version).not.toBe(enabled.version);
  } finally {
    await fixture.maintenance
      .$executeRaw`DELETE FROM app."EntitlementGrant" WHERE id=${grantId}::uuid`;
    await fixture.maintenance
      .$executeRaw`DELETE FROM app."EntitlementGrantAudit" WHERE "grantId"=${grantId}::uuid`;
    await fixture.close();
  }
});
