import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createOrm } from "../packages/database/dist/client.js";
import { DeletionRepository } from "../packages/database/dist/deletion.repository.js";
import { PrivacyJournal } from "../packages/database/dist/privacy-journal.js";
import { ClerkIdentityStore } from "../apps/api/src/modules/identity/clerk/identity-store.js";
import { ClerkCredentialVerifier } from "../apps/api/src/modules/identity/clerk/credential-verifier.js";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
import { PrivacyService } from "../apps/api/src/modules/privacy/privacy.service.js";
import { processDeletion } from "../apps/worker/src/privacy/process-deletion.js";
import { createFixtureOwner } from "./fixtures/database.js";
import { createClerkFixture } from "./fixtures/clerk.js";

it("journals mapped Clerk identity before purge, retries provider failure and retains replay tombstones", async () => {
  if (!process.env.DATABASE_URL)
    throw new Error("Local runtime database required");
  const fixture = await createClerkFixture(),
    account = fixture.account(true);
  const owner = createFixtureOwner(),
    runtime = createOrm(process.env.DATABASE_URL);
  const store = new ClerkIdentityStore(
    runtime,
    new IdentityVault(
      fixture.environment.AUTH_TOKEN_KEY,
      fixture.environment.AUTH_EMAIL_HASH_KEY,
    ),
  );
  const verifier = new ClerkCredentialVerifier(
    fixture.environment,
    fixture.gateway,
  );
  const credential = await verifier.verify(
    await fixture.token(account.userId, account.sessionId),
  );
  const principal = await store.withCredential(
    credential,
    async ({ principal }) => principal,
  );
  const directory = await mkdtemp(join(tmpdir(), "joint-clerk-privacy-"));
  await chmod(directory, 0o700);
  const journal = new PrivacyJournal(join(directory, "ledger.ndjson"));
  const repository = new DeletionRepository(runtime),
    service = new PrivacyService(repository, journal);
  try {
    const receipt = await service.request(
      { ...principal, requestId: randomUUID() },
      randomUUID(),
    );
    const entries = [];
    for await (const entry of journal.entries()) entries.push(entry);
    const identities = [
      {
        provider: "clerk",
        issuer: fixture.environment.CLERK_ISSUER,
        subject: account.userId,
      },
    ];
    expect(entries).toEqual([
      expect.objectContaining({
        kind: "DELETE_USER",
        userId: principal.userId,
        providerIdentities: identities,
      }),
    ]);
    await expect(
      store.withCredential(credential, async () => true),
    ).rejects.toMatchObject({ status: 401 });
    const scoped = {
      claim: () => repository.claim(receipt.id),
      purge: (id: string, lease: string) => repository.purge(id, lease),
      finish: (id: string, lease: string, deleted: boolean) =>
        repository.finish(id, lease, deleted),
    };
    expect(
      await processDeletion(
        scoped,
        {
          supportsClerk: true,
          deleteUser: async (userId, _signal, value) => {
            expect(userId).toBe(principal.userId);
            expect(value).toEqual(identities);
            expect(
              await owner.user.findUnique({ where: { id: userId } }),
            ).toMatchObject({ status: "DELETED", emailHash: null });
            return false;
          },
        },
        journal,
      ),
    ).toBe("pending");
    expect(await service.status(receipt.id, receipt.statusToken)).toMatchObject(
      { state: "PROVIDER_PENDING" },
    );
    await owner.$executeRaw`UPDATE app."DeletionRequest" SET "runAfter"=clock_timestamp()-interval '1 second' WHERE id=${receipt.id}::uuid`;
    expect(
      await processDeletion(
        scoped,
        {
          supportsClerk: true,
          deleteUser: async (_id, _signal, value) => {
            expect(value).toEqual(identities);
            return true;
          },
        },
        journal,
      ),
    ).toBe("completed");
    expect(await service.status(receipt.id, receipt.statusToken)).toMatchObject(
      { state: "COMPLETED" },
    );
    expect(
      await owner.$queryRaw`SELECT subject FROM app."ClerkIdentity" WHERE issuer=${credential.issuer}`,
    ).toHaveLength(1);
    expect(
      await owner.$queryRaw`SELECT "internalSessionId" FROM app."ClerkSession" WHERE issuer=${credential.issuer}`,
    ).toHaveLength(1);
    await expect(
      store.withCredential(
        { ...credential, sessionId: "sess_" + randomBytes(16).toString("hex") },
        async () => true,
      ),
    ).rejects.toMatchObject({ status: 401 });
  } finally {
    await owner.$executeRaw`DELETE FROM app."ClerkSession" WHERE issuer=${credential.issuer}`;
    await owner.$executeRaw`DELETE FROM app."ClerkIdentity" WHERE issuer=${credential.issuer}`;
    await owner.deletionRequest.deleteMany({
      where: { userId: principal.userId },
    });
    await owner.sessionRegistry.deleteMany({
      where: { userId: principal.userId },
    });
    await owner.auditEvent.deleteMany({ where: { userId: principal.userId } });
    await owner.user.deleteMany({ where: { id: principal.userId } });
    await runtime.$disconnect();
    await owner.$disconnect();
    await rm(directory, { recursive: true });
  }
});
