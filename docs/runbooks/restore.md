# Local restore and privacy replay

Task 1.6 provides an isolated PostgreSQL recovery rehearsal. It does not deploy an
application, reset development, restore shared Auth, or establish production
backup, compliance, RPO or RTO guarantees.

## Run the rehearsal

Prerequisites: the migrated local development PostgreSQL container, locally
available `postgres:17.6` Docker image, a Docker daemon, built database packages,
and the independent private journal created by `pnpm privacy:setup`. Preserve an
existing journal; never replace it to make a recovery check pass.

```sh
pnpm build
node --env-file-if-exists=.env --env-file-if-exists=.env.database \
  --env-file-if-exists=.env.privacy scripts/local-restore-rehearsal.mjs
```

Use the host's usual `DOCKER_HOST` and `DOCKER_CONFIG` when required. The script
accepts only a local maintenance database whose loopback port uniquely identifies
a running Docker PostgreSQL container. It never prints connection URLs, dump
contents, user records, financial values or provider errors. Output is a result
object containing check outcomes and replay counts, or a documented restore
stage code. The integration check uses the same command and allows 180 seconds:

```sh
pnpm test:integration tests/restore-rehearsal.integration.ts
```

The source connection is read-only. `pg_dump --format=custom --schema=app
--no-owner` takes a consistent application snapshot. Dumps use private files
(mode `0600`) in a random private directory (`0700`) outside Git. The independent
journal remains outside the database dump. Original development Auth, runtime
roles, containers and volumes receive no writes.

The script creates two new, labelled PostgreSQL clusters with random names,
separate volumes and random loopback ports. It first restores the application
snapshot into a clone and adds synthetic fixtures there. It takes a second backup,
then restores that backup into another empty cluster. Only afterward does it
append verified synthetic deletion and leave intents to a separate private
journal snapshot. This proves replay of intents newer than the restored backup.
All original journal entries are verified and replayed too, into the isolated
copy only. A missing, truncated, corrupt, unsafe-permission or conflicting journal
fails closed.

## Closed restore, replay, then application access

`joint_app_runtime` starts as `NOLOGIN` in each fresh cluster. No development or
global role is changed. A target-only gate and event receipts live outside the
application schema. The labelled container identity is checked before replay,
restore and cleanup. No runtime connection opens until replay and provider
reconciliation finish successfully.

Replay preserves append order and processes every verified entry, rather than
using backup time as a filter. Event UUIDs and canonical intent hashes make
repeated replay harmless and reject conflicting reuse. `DELETE_USER` first
creates a disabled tombstone when the user was absent from the older backup. It
then uses the application's canonical exit and leased purge functions. Sole-owner
accounts are removed; accounts with another recorded owner who has not been deleted remain. A deleted
owner tombstone cannot preserve records after the final owner is purged. Every budget
scope touching an account being purged is removed as a whole, including its
budgets, lines and revisions. Author-private notes, sessions and request keys are
purged. Retained references point to the minimal deleted user tombstone.

`LEAVE_HOUSEHOLD` uses the canonical exit function against the recorded membership.
Recorded owners retain read-only archive authority. Former grants grant no
archive access. A previously applied intent does not recreate an active user,
membership or session. A provider failure leaves the application copy closed,
with deletion visibly pending, and permits replay to resume safely.

The rehearsal deliberately uses a dedicated synthetic HTTP Auth inventory on a
random loopback port. It mirrors identifiers from the isolated copy and never
forwards traffic to development Auth. Deletions require both a successful delete
and a subsequent absence check. Injected provider failures, missing journals and
corrupt journals must leave runtime login disabled. This proves recovery ordering
and failure handling; it is **not** proof of restoring or reconciling a real Auth
backup. Actual local Auth deletion is tested separately by the privacy worker
integration. Any real recovery must reconcile the actual separately restored Auth
inventory before reopening application traffic.

After successful replay the script briefly enables only the isolated runtime role
for direct restricted-role checks. The checks prove deletion cannot resurrect,
absent users are tombstoned, whole budget scopes disappear, remaining joint-owner
history survives, owner archives exclude other accounts and private notes, and a
neighboring household stays isolated. It verifies the source connection stayed read-only and development runtime role
flags stayed unchanged. It never reads application source rows for reporting.
The synthetic recovery proof remains isolated from concurrent development
fixtures. Restored stale sessions are revoked before replay; proof sessions are
fresh and exist only inside the restored cluster.

All owned rehearsal containers, labelled volumes, dumps and temporary journal
copies are removed after success or failure. Development resources and the
independent source journal remain intact. Cleanup failures are reported as a
failure; inspect only resources carrying that exact rehearsal label. Never use a
broad Docker prune, force-remove another container, or reset development.

## Key custody and an operational recovery

The application dump contains encrypted imports, export chunks and identity
material. Keep encryption keys separately from database backups, with documented
access, retention and rotation. Preserve the exact import data key and identity
vault key version needed to decrypt retained ciphertext. The rehearsal never
exports keys or sends them to Docker arguments. A synthetic import is sealed before backup with a random key held only in process
memory, outside both dumps and the journal. The restored restricted owner reads
that ciphertext, decrypts it with the separately retained key, and verifies its
reconciled source row. This proves the custody/decryption path for synthetic
imports. An operational recovery must additionally verify approved historical
import and identity-vault keys; no development user ciphertext is decrypted.

For a real recovery, stop application and worker traffic and all journal writers;
retain an independent complete journal snapshot and document its final event.
Restore application and Auth into isolated destinations with runtime login
closed. Verify dump integrity, migration/schema compatibility and key custody.
Replay all deletion and leave intents idempotently, reconcile the actual Auth
provider and sessions, verify retained ownership and tenant isolation, and only
then authorize opening traffic. Revoke restored stale sessions and export
objects before allowing fresh authentication. Keep provider outages visibly
pending. Missing keys, incomplete journals, conflicting receipts, provider errors,
failed isolation checks or incomplete cleanup are blockers, not successful
recovery.

No production backup storage, managed KMS, provider retention/deletion guarantees,
restore-time target or cloud vendor region is established by this local exercise.
Those remain explicit future launch gates.
