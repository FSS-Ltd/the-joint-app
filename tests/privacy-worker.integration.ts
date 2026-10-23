import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { authServerEnvironmentSchema } from "../packages/contracts/dist/index.js";
import { createOrm } from "../packages/database/dist/client.js";
import { DeletionRepository } from "../packages/database/dist/deletion.repository.js";
import { PrivacyJournal } from "../packages/database/dist/privacy-journal.js";
import { IdentityService } from "../apps/api/src/modules/identity/identity.service.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
import { IdentityVerifier } from "../apps/api/src/modules/identity/identity-verifier.js";
import { SessionStore } from "../apps/api/src/modules/identity/session-store.js";
import { PrivacyService } from "../apps/api/src/modules/privacy/privacy.service.js";
import { LocalAuthAdmin } from "../apps/worker/src/privacy/local-auth-admin.js";
import { processDeletion } from "../apps/worker/src/privacy/process-deletion.js";
import { createFixtureOwner } from "./fixtures/database.js";
import { createLocalAuthFixture, totp } from "./fixtures/local-auth.js";

it("deletes an actual local Auth identity only after verified journal intent and confirms completion without household membership", async () => {
  if (!process.env.DATABASE_URL || !process.env.SUPABASE_TEST_ADMIN_KEY)
    throw new Error("Local database and Auth fixtures are required");
  const environment = authServerEnvironmentSchema.parse(process.env);
  const auth = createLocalAuthFixture(),
    owner = createFixtureOwner(),
    runtime = createOrm(process.env.DATABASE_URL);
  const directory = await mkdtemp(join(tmpdir(), "joint-worker-privacy-"));
  await chmod(directory, 0o700);
  const journal = new PrivacyJournal(join(directory, "deletion-ledger.ndjson"));
  const user = await auth.createConfirmedUser();
  const vault = new IdentityVault(
    environment.AUTH_TOKEN_KEY,
    environment.AUTH_EMAIL_HASH_KEY,
  );
  const store = new SessionStore(
    runtime,
    vault,
    new IdentityVerifier(environment.AUTH_ISSUER),
    auth.provider,
  );
  const identity = new IdentityService(store, auth.provider, runtime, vault);
  const repository = new DeletionRepository(runtime);
  const privacy = new PrivacyService(repository, journal);
  const provider = new LocalAuthAdmin(
    environment.SUPABASE_AUTH_URL,
    process.env.SUPABASE_TEST_ADMIN_KEY,
  );
  let providerRemoved = false;
  try {
    const factor = await auth.provider.enroll(user.session);
    const verified = await auth.provider.verifyMfa(
      user.session,
      factor.factorId,
      totp(factor.secret),
    );
    const browserToken = await store.register(verified, "NORMAL");
    const principal = await identity.actor(browserToken);
    const receipt = await privacy.request(
      { ...principal, requestId: randomUUID() },
      randomUUID(),
    );
    await expect(identity.actor(browserToken)).rejects.toThrow();
    expect(
      (
        await owner.user.findUniqueOrThrow({
          where: { id: user.session.user.id },
        })
      ).status,
    ).toBe("DISABLED");
    const scopedRepository = {
      claim: () => repository.claim(receipt.id),
      purge: (id: string, lease: string) => repository.purge(id, lease),
      finish: (id: string, lease: string, deleted: boolean) =>
        repository.finish(id, lease, deleted),
    };
    expect(await processDeletion(scopedRepository, provider, journal)).toBe(
      "completed",
    );
    providerRemoved = true;
    expect(await privacy.status(receipt.id, receipt.statusToken)).toMatchObject(
      { id: receipt.id, state: "COMPLETED" },
    );
    expect(
      (
        await owner.user.findUniqueOrThrow({
          where: { id: user.session.user.id },
        })
      ).status,
    ).toBe("DELETED");
    await expect(
      auth.provider.login(user.email, user.password),
    ).rejects.toThrow();
    const absent = await fetch(
      `${environment.SUPABASE_AUTH_URL}/admin/users/${user.session.user.id}`,
      {
        method: "DELETE",
        headers: {
          apikey: process.env.SUPABASE_TEST_ADMIN_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_TEST_ADMIN_KEY}`,
        },
      },
    );
    expect(absent.status).toBe(404);
    expect(await absent.json()).toMatchObject({ error_code: "user_not_found" });
    expect(await provider.deleteUser(user.session.user.id)).toBe(true);
  } finally {
    const userId = user.session.user.id;
    await owner.deletionRequest.deleteMany({ where: { userId } });
    await owner.auditEvent.deleteMany({ where: { userId } });
    await owner.sessionRegistry.deleteMany({ where: { userId } });
    await owner.user.deleteMany({ where: { id: userId } });
    if (!providerRemoved) await auth.deleteUser(userId);
    await runtime.$disconnect();
    await owner.$disconnect();
    await rm(directory, { recursive: true });
  }
});
