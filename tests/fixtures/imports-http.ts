import { randomBytes, randomUUID } from "node:crypto";
import { expect } from "vitest";
import {
  accountSchema,
  authResultSchema,
  authServerEnvironmentSchema,
  importBatchSchema,
  importJobResultSchema,
  mfaEnrollmentSchema,
  transactionListSchema,
  type CsvMapping,
  type ImportBatchResponse,
  type TransactionResponse,
} from "../../packages/contracts/dist/index.js";
import { createOrm } from "../../packages/database/dist/client.js";
import { createDatabase } from "../../packages/database/dist/index.js";
import { JobsRepository } from "../../packages/database/dist/jobs.repository.js";
import { createApplication } from "../../apps/api/dist/application.js";
import { createImportHandlers } from "../../apps/worker/src/imports/handlers.js";
import { createFixtureOwner } from "./database.js";
import { createLocalAuthFixture, totp } from "./local-auth.js";

export interface ImportsHttpFixture {
  readonly base: string;
  readonly actorToken: string;
  readonly memberToken: string;
  readonly outsiderToken: string;
  readonly accountId: string;
  readonly manualAccountId: string;
  readonly memberId: string;
  readonly otherHouseholdId: string;
  readonly root: string;
  readonly maintenance: ReturnType<typeof createFixtureOwner>;
  request(
    path: string,
    method?: string,
    body?: unknown,
    token?: string,
    headers?: Record<string, string>,
  ): Promise<Response>;
  uploadHeaders(id?: string): Record<string, string>;
  batch(id: string): Promise<ImportBatchResponse>;
  preview(csv: string): Promise<ImportBatchResponse>;
  progress(batchId: string): Promise<void>;
  ledger(id?: string, token?: string): Promise<TransactionResponse[]>;
  close(): Promise<void>;
}

/** Each journey owns its real API, isolated synthetic tenants, Auth users and encryption key. */
export async function createImportsHttpFixture(): Promise<ImportsHttpFixture> {
  if (!process.env.DATABASE_URL)
    throw new Error("Runtime database is required");
  const runtime = createOrm(process.env.DATABASE_URL);
  const maintenance = createFixtureOwner();
  const health = createDatabase(process.env.DATABASE_URL, 500);
  const auth = createLocalAuthFixture();
  const key = randomBytes(32).toString("base64");
  const jobs = new JobsRepository(runtime);
  const handlers = createImportHandlers(key);
  const householdId = randomUUID();
  const otherHouseholdId = randomUUID();
  const memberId = randomUUID();
  const userIds: string[] = [];
  let app: Awaited<ReturnType<typeof createApplication>> | undefined;
  let base = "";
  let actorToken = "";
  let accountId = "";
  let manualAccountId = "";
  const root = `/households/${householdId}`;
  const mapping: CsvMapping = {
    date: 0,
    description: 1,
    amount: 2,
    debit: null,
    credit: null,
    currency: null,
    sourceId: null,
    dateFormat: "ISO",
    decimalSeparator: "DOT",
    amountMode: "SIGNED",
    positiveIs: "INFLOW",
  };

  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    token = actorToken,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const raw = typeof body === "string";
    return fetch(`${base}/v1${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Session ${token}` } : {}),
        ...(body === undefined
          ? {}
          : { "Content-Type": raw ? "text/csv" : "application/json" }),
        ...headers,
      },
      ...(body === undefined
        ? {}
        : { body: raw ? body : JSON.stringify(body) }),
    });
  }
  function uploadHeaders(id = accountId): Record<string, string> {
    return {
      "X-Account-Id": id,
      "X-Import-Mapping": encodeURIComponent(JSON.stringify(mapping)),
      "Idempotency-Key": randomUUID(),
    };
  }
  async function batch(id: string): Promise<ImportBatchResponse> {
    const response = await request(`${root}/imports/${id}`);
    expect(response.ok).toBe(true);
    return importBatchSchema.parse(await response.json());
  }
  async function progress(batchId: string): Promise<void> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const job = await runtime.job.findFirst({
        where: { householdId, resourceId: batchId, state: "QUEUED" },
        orderBy: { createdAt: "asc" },
      });
      if (!job) return;
      const lease = await jobs.claim(
        `http-import-test-${householdId}`,
        Object.keys(handlers),
        5000,
        job.id,
      );
      if (!lease) throw new Error("Expected the fixture's queued import lease");
      const handler = handlers[lease.type];
      if (!handler) throw new Error("Unexpected import job type");
      expect(await jobs.complete(lease, (tx) => handler(lease, tx), 5000)).toBe(
        true,
      );
    }
    throw new Error("Import did not finish its bounded fixture jobs");
  }
  async function preview(csv: string): Promise<ImportBatchResponse> {
    const response = await request(
      `${root}/imports/preview`,
      "POST",
      csv,
      actorToken,
      uploadHeaders(),
    );
    expect(response.status).toBe(202);
    const result = importJobResultSchema.parse(await response.json());
    expect(result.batch.state).toBe("QUEUED");
    await progress(result.batch.id);
    return batch(result.batch.id);
  }
  async function ledger(
    id = accountId,
    token = actorToken,
  ): Promise<TransactionResponse[]> {
    const response = await request(
      `${root}/transactions?accountId=${id}`,
      "GET",
      undefined,
      token,
    );
    expect(response.ok).toBe(true);
    return transactionListSchema.parse(await response.json()).items;
  }

  async function close(): Promise<void> {
    await app?.close();
    await maintenance.transaction.deleteMany({
      where: { householdId: { in: [householdId, otherHouseholdId] } },
    });
    await maintenance.importBatch.deleteMany({
      where: { householdId: { in: [householdId, otherHouseholdId] } },
    });
    await maintenance.account.deleteMany({
      where: { householdId: { in: [householdId, otherHouseholdId] } },
    });
    await maintenance.household.deleteMany({
      where: { id: { in: [householdId, otherHouseholdId] } },
    });
    await maintenance.sessionRegistry.deleteMany({
      where: { userId: { in: userIds } },
    });
    await maintenance.requestKey.deleteMany({
      where: { userId: { in: userIds } },
    });
    await maintenance.auditEvent.deleteMany({
      where: { userId: { in: userIds } },
    });
    await maintenance.user.deleteMany({ where: { id: { in: userIds } } });
    for (const id of userIds) await auth.deleteUser(id);
    await Promise.all([
      runtime.$disconnect(),
      maintenance.$disconnect(),
      health.close(),
    ]);
  }
  try {
    app = await createApplication(health, undefined, {
      database: runtime,
      environment: authServerEnvironmentSchema.parse(process.env),
      importKey: key,
    });
    await app.listen(0, "127.0.0.1");
    base = await app.getUrl();
    async function createUser() {
      const user = await auth.createConfirmedUser();
      userIds.push(user.session.user.id);
      const response = await request(
        "/auth/login",
        "POST",
        { email: user.email, password: user.password },
        "",
      );
      expect(response.ok).toBe(true);
      const result = authResultSchema.parse(await response.json());
      if (!result.browserToken)
        throw new Error("Expected opaque browser credentials");
      return { id: user.session.user.id, token: result.browserToken };
    }
    const actor = await createUser();
    const member = await createUser();
    const outsider = await createUser();
    actorToken = actor.token;
    const memberToken = member.token;
    const outsiderToken = outsider.token;
    await maintenance.household.create({
      data: {
        id: householdId,
        name: `Synthetic import HTTP ${householdId}`,
        memberships: {
          create: [
            { userId: actor.id, slot: 1, role: "MEMBER" },
            { id: memberId, userId: member.id, slot: 2, role: "ADMIN" },
          ],
        },
      },
    });
    await maintenance.household.create({
      data: {
        id: otherHouseholdId,
        name: `Synthetic import outsider ${otherHouseholdId}`,
        memberships: { create: { userId: outsider.id, slot: 1 } },
      },
    });
    await maintenance.sessionRegistry.updateMany({
      where: { userId: { in: [actor.id, member.id] } },
      data: { householdId },
    });
    await maintenance.sessionRegistry.updateMany({
      where: { userId: outsider.id },
      data: { householdId: otherHouseholdId },
    });
    const enroll = await request("/auth/mfa/enroll", "POST", {});
    const factor = mfaEnrollmentSchema.parse(await enroll.json());
    expect(
      (
        await request("/auth/mfa/verify", "POST", {
          factorId: factor.factorId,
          code: totp(factor.secret),
        })
      ).ok,
    ).toBe(true);
    for (const label of ["CSV account", "Manual account"]) {
      const response = await request(
        `${root}/accounts`,
        "POST",
        { label, kind: "CURRENT", currency: "GBP", liquidity: "AVAILABLE" },
        actorToken,
        { "Idempotency-Key": randomUUID() },
      );
      expect(response.ok).toBe(true);
      const account = accountSchema.parse(await response.json());
      if (label === "CSV account") accountId = account.id;
      else manualAccountId = account.id;
    }

    return {
      base,
      actorToken,
      memberToken,
      outsiderToken,
      accountId,
      manualAccountId,
      memberId,
      otherHouseholdId,
      root,
      maintenance,
      request,
      uploadHeaders,
      batch,
      preview,
      progress,
      ledger,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
