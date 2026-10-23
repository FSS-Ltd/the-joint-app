# Task 1.4 — CSV imports, manual transactions and corrections

Predecessor PR #10 verified MERGED into main at `64c45dbcf7665b13c0d46cc09b5841e061da5335`; final head `e0a7d91f9933b97ff9fcd433217169c159355359`, actual checked test-merge `80523b3cd828a708399b6446363ceca8b1687598`, Foundation checks SUCCESS, run 39889155688. Previous goal turn made verified progress. Branch: build/1.4-csv-manual-transactions. No Task 1.5 work before this step's PR/current-CI/verified-merge gate.

All application execution and data remain local through MVP completion and explicit deployment approval. GitHub source/synthetic CI remain authorised. No bank/broker connection, deployment, cloud object storage, child profile, spend or external message.

## Scope and design

Implement the complete Task 1.4 acceptance: bounded CSV upload, explicit column/date/decimal/sign mapping, preview with durable row rejects and overlap decisions, idempotent commit, real bounded worker processing/progress, eligible import rollback/restore, manual transactions and auditable corrections. Preserve two legitimate equal purchases. Amount/date/description similarity is a warning, never unique identity. No spending reports/budgets or category automation in this step.

Use the existing evergreen/ivory/sage/apricot palette and focused components. Actual NU.Finance and Payrix images were inspected again: adapt readable dense activity rows, clear account grouping, soft opaque surfaces and generous mobile controls. `/activity` is a real account-scoped ledger, with `/imports` for choose/upload/map/review/commit/history. Add real Activity navigation; no inert future tabs. Preview/reject/overlap lists are paginated. Progress never implies partial rows are already in the ledger.

## Interfaces

All paths below are under `/v1/households/:householdId`; BFF equivalents under `/api/households/:householdId`. Existing opaque sessions, origin/CSRF, strict schemas, no-store and safe errors remain authoritative.

- POST `/imports/inspect`: raw `text/csv` UTF-8 bytes, `X-Account-Id` UUID; owner only. Return indexed headers and row count. Maximum 10 MiB and 50,000 data records, 64 KiB per CSV record, 100 columns. Reject malformed quoting/encoding/oversize safely; never return parser exception text.
- POST `/imports/preview`: same raw bytes; `X-Import-Mapping` contains URI-encoded strict mapping JSON and `X-Account-Id`; UUID Idempotency-Key. Mapping uses zero-based column indexes: date, description, amount or debit/credit, optional currency and sourceId. Explicit dateFormat ISO/DMY/MDY, decimalSeparator DOT/COMMA, amountMode SIGNED/DEBIT_CREDIT, positiveIs INFLOW/OUTFLOW. Return `{batch, jobId}` with state QUEUED. User explicitly chooses conventions; no guessing ambiguous dates.
- GET `/imports?accountId=...`: owner-only bounded history. GET `/imports/:id`: safe status/counts/version/retention; GET `/imports/:id/rows?offset=0&limit=100&filter=ALL|REVIEW|REJECTED`: bounded preview rows.
- PATCH `/imports/:id/review`: quoted If-Match batch version; `{decisions:[{rowNumber,decision:KEEP|SKIP}]}` up to 100. Only READY owner previews, any valid nonduplicate row. No hidden matching on financial similarity.
- POST `/imports/:id/commit`: UUID Idempotency-Key, quoted If-Match; `{acceptRejectedRows:boolean}`. READY requires every overlap resolved and explicit acknowledgement when rejects exist. COMMITTED returns the existing result, never new rows. ROLLED_BACK starts explicit restore of the same source rows. Return `{batch,jobId}`. Concurrent retries cannot duplicate spending.
- DELETE `/imports/:id`: quoted If-Match; owner rollback only for a committed batch whose own rows have no later corrections, classifications or notes. Reject the entire rollback on protected lineage. Soft rollback preserves source rows and allows explicit restore through commit. Matching rows from other batches are never removed.
- DELETE `/imports/:id/original`: quoted If-Match; owner may clear the encrypted original early without removing normalised records. Automatic expiry also clears original bytes.
- GET `/transactions?accountId=...&cursor=...&limit=50`: TRANSACTIONS access, bounded actor/epoch/account-bound opaque pagination. TOTALS/NONE/cross-household cannot read descriptions, dates, categories, source IDs, preview or notes.
- POST `/transactions`: owner, UUID Idempotency-Key; accountId, bookedDate, money, description. Creates a manual booked record and immutable initial revision.
- PATCH `/transactions/:id`: owner, quoted If-Match; manual-only money/date/description correction, with immutable revision. CSV original financial fields cannot be overwritten.
- PATCH `/transactions/:id/annotation`: quoted transaction If-Match; optional category/merchant classification (owner only), optional private note plus noteVersion (author only). Return the effective transaction including only the caller's private note. Classification undo is another versioned correction, preserving history.

Transport ruling: raw CSV with small validated metadata headers avoids base64 or unbounded multipart/JSON expansion. BFF reads the body with an explicit byte bound and forwards only fixed trusted headers/routes. Nest applies raw parsing only to inspect/preview, with the existing small JSON limit on all other routes. Browser file reads are asynchronous; it asks inspect for column names rather than parsing a large file on the UI thread.

## Data and worker contract

New tenant-matched models: ImportBatch, ImportObject, Transaction, TransactionRevision, TransactionOverride and TransactionNote. Existing Account is canonical; transactions never invent or automatically change its manually recorded balance.

ImportBatch: id, householdId, accountId, requestedByUserId/requestedByMembershipId, fileChecksum, mappingHash, mapping JSON, parserVersion, state QUEUED/PREVIEWING/READY/COMMITTING/COMMITTED/ROLLED_BACK/FAILED/EXPIRED, version, datasetVersion (captured account version), preview JSON (normalised/rejected row array), decisions JSON (row-number map), totalRows, processedRows, validRows, rejectedRows, overlapRows, duplicateRows, committedRows, skippedRows, failureCode (safe code only), createdAt, updatedAt, committedAt, rolledBackAt, previewExpiresAt. Unique accountId/fileChecksum prevents exact-file duplication independently of request keys. Changed mapping is allowed only before commit; committed source history is not silently remapped.

ImportObject: batchId PK with tenant/account-matched FK, ciphertext nullable, expiresAt, deletedAt. Original bytes are AES-256-GCM encrypted with per-object AAD. A separate generated `IMPORT_DATA_KEY` stays in ignored `.env.imports`, shared explicitly by API/worker. Preview retention is 24 hours; successful import retains originals at most seven days, with earlier owner deletion. Normalised rows/reject reasons follow account retention. No original filename or raw row is logged.

Transaction: id, householdId/accountId, sourceNamespace CSV/MANUAL, sourceId (max 160), sourceHash/fingerprint (64-char hashes), amountMinor bigint, currency GBP, bookedDate DATE, description (max 500), status BOOKED/SUPERSEDED, originImportBatchId nullable, csvRowNumber nullable, version, createdAt/updatedAt. Unique account/sourceNamespace/sourceId. Without explicit stable source IDs, use fileChecksum/rowNumber; equal purchases on separate rows survive. Fingerprint is indexed but never unique. Explicit stable source-ID duplicates are skipped only when original normalised payload matches; conflicts become durable rejects.

TransactionRevision: immutable id, tenant/account/transaction, actorMembershipId, version, kind CREATED/MANUAL_CORRECTION/CLASSIFICATION, data JSON, createdAt; unique transaction/version. TransactionOverride: one owner-controlled category/merchant record per transaction, authorMembershipId, version and timestamps. TransactionNote: separate authorUserId/authorMembershipId, body nullable (max 2,000), version/timestamps; unique transaction/author. Separation prevents a viewer reading owner notes through shared classifications. Note writes do not expose content or note-version changes to another viewer.

Force RLS on every new table. Import batch/object/preview/reject access is owner-only. Transaction/revision/override reads require TRANSACTIONS; writes require owner; notes require current TRANSACTIONS plus author identity. No PUBLIC/anon/authenticated finance access. Runtime has no general delete or immutable-key update. Narrow expiry clears ciphertext only. Tenant-matched FKs and currency/source checks are database constraints.

Job payloads use trusted types csv.preview/csv.commit/csv.restore, separate batch resource identity and strict empty or offset-only payloads, never CSV or session tokens. A distinct trusted JobContext is resolved from the actual live leased Job, ImportBatch requester, active User/Membership and recorded account ownership. `withJobScope` uses transaction-local job id/lease token; the database verifies job type/resource/household/requester/lease before allowing finance access. Never turn caller-supplied UUIDs or a job payload into a browser AuthContext.

PREVIEW normalises the bounded file once, records per-row validation/review information in the batch's owner-only JSON, and publishes READY atomically. Large canonical commits stage up to 500 rows per bounded existing Job transaction; a durable continuation job is created in that same transaction. Staged rows are invisible to browser scopes until a small final transaction publishes COMMITTED and its revision/outbox event. Crash/retry cannot publish a partial ledger or double rows. Source-row IDs and progress fences make chunks idempotent. Restore republishes the same rows; no automatic cross-file copy or matching. Failure leaves staged rows hidden and reports safe progress/error state. Lease fencing and current owner/membership checks apply on every chunk. Unknown jobs remain unclaimed.

## Implementation ownership

- Parent: contracts, exact date/amount/CSV normalisation and tests, API services/controllers, bounded upload/BFF coordination, environment/key wiring/docs and combined delivery.
- Database subtask: Prisma models/additive migration, RLS/job scope, projections needed for staged visibility/rollback safety and real-role isolation tests. No root/worker/UI edits.
- Worker subtask: real import PREVIEW/COMMIT/RESTORE handlers and worker registration, shared server-only encryption/storage helper, local key setup and worker recovery tests. Coordinate precise interfaces before edits; no schema/contracts/root-manifest edits.
- UI subtask: mobile-first activity/import screens, fixed BFF routes/helpers, actual browser journey and BFF tests. No backend/schema/contracts/root edits.

## Verification and delivery

Observe meaningful tests fail before implementation/fixes. Cover quoted/newline/BOM/malformed/oversize CSV, 50,000/50,001 records, explicit UK/US date handling, decimal/sign/currency errors, row rejects without silent drops, two equal legitimate purchases, exact file replay, overlapping files with explicit decisions, stable-ID conflict, concurrent commits, mid-chunk failure/retry/final publication, rollback protection/restore, note privacy, owner versus admin/viewer, live revocation and worker shutdown/expiry. Measure the 50,000-row path rather than claiming it from a two-row fixture.

Run all existing commands, fresh source frozen install/build/types and fresh disposable database migration/runtime setup. Inspect actual UI at 390/1280px, 320px overflow, keyboard, 200% zoom and reduced motion. Self-review and one fresh independent whole-step review precede PR. Record latest head, test-merge, CI and actual authorised merge evidence before Task 1.5. No deployment at this gate.

Dependency: csv-parse 7.0.3 (MIT), registry exact version checked. A maintained parser is justified for quoted fields, embedded newlines and bounded RFC-style parsing; no ad hoc CSV splitter. Primary references: [parser options](https://csv.js.org/parse/options/), [async iterator](https://csv.js.org/parse/api/async_iterator/). Existing external pins remain unchanged.

State: PR #11 open. Initial clean-source verification passed; the hosted capacity timeout prompted reviewed statement-scoped policy fixes. Current regression and CI rerun remain required before authorised merge. No later step or deployment started.

Concurrency ruling: a fresh commit requires the preview account version to match current activity. Account locks serialize competing commits; only one committing or partially staged failed batch per account is allowed. Manual financial writes wait until that batch completes or resumes. Final publication, rollback, manual financial corrections and classifications advance the account version; author-private notes do not. Overlap candidates are fetched for bounded displayed pages rather than repeated in every stored row. Merchant labels are limited to 120 characters.

Large-import policy ruling: live account/batch/committing-job tuple sets are evaluated once per SQL statement, with immutable tenant-matched row references and author checks. No authority is cached across statements or accepted from payload UUIDs. Staging inserts require an actual live `csv.commit` lease and batch state COMMITTING; terminal reads and final audit/outbox bookkeeping remain separate. Revision reads reuse actual Transaction RLS. Full 50,000-row, five-second chunk/statement and 180-second end-to-end test bounds remain unchanged.
