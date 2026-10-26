import { afterAll, beforeAll, expect, it } from "vitest";
import { createFundingEvidenceFixture } from "./fixtures/funding-evidence.js";

const f = createFundingEvidenceFixture();
let exportId: string;
beforeAll(async () => {
  await f.setup();
  await f.owner
    .$executeRaw`INSERT INTO app."Transaction"(id,"householdId","accountId",currency,"sourceNamespace","sourceId","sourceHash",fingerprint,"amountMinor","bookedDate",description,status,version,"createdAt","updatedAt")
    SELECT gen_random_uuid(),${f.hh}::uuid,${f.account}::uuid,'GBP','MANUAL','planning:'||n,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',-100,'2026-10-01'::date,'Synthetic bounded export','BOOKED',1,clock_timestamp(),clock_timestamp() FROM generate_series(1,501) n`;
  exportId = await f.scoped.withScope(f.a, async (tx) => {
    const [row] = await tx.$queryRaw<
      { id: string }[]
    >`SELECT app.request_export(ARRAY[${f.account}::uuid],false) AS id`;
    if (!row) throw Error("Missing synthetic export");
    return row.id;
  });
});
afterAll(async () => {
  await f.owner
    .$executeRaw`DELETE FROM app."ExportRequest" WHERE "householdId"=${f.hh}::uuid`;
  await f.owner.job.deleteMany({ where: { householdId: f.hh } });
  await f.close();
});

it("keeps bounded pages exact within the existing transaction budget when planner costs trigger JIT", async () => {
  const results = await f.owner.$transaction(async (tx) => {
    // Test-only thresholds deterministically reproduce the planner transition
    // observed after the 50,000-row fixtures. No role/database setting changes.
    await tx.$executeRaw`SET LOCAL jit=on`;
    await tx.$executeRaw`SET LOCAL jit_above_cost=0`;
    await tx.$executeRaw`SET LOCAL jit_inline_above_cost=0`;
    await tx.$executeRaw`SET LOCAL jit_optimize_above_cost=0`;
    const pages: { digest: string; records: number; isolated: boolean }[] = [];
    for (let page = 0; page < 16; page++) {
      const [row] = await tx.$queryRaw<
        { digest: string; records: number; isolated: boolean }[]
      >`SELECT md5(string_agg(record_data::text,',' ORDER BY key)) AS digest,count(*)::integer AS records,bool_and(record_data->>'accountId'=${f.account}) AS isolated FROM app.export_records(${exportId}::uuid,'')`;
      if (!row) throw Error("Missing synthetic page");
      pages.push(row);
    }
    return pages;
  });
  expect(results).toHaveLength(16);
  expect(new Set(results.map((page) => page.digest)).size).toBe(1);
  expect(results.every((page) => page.records === 500 && page.isolated)).toBe(
    true,
  );
});
