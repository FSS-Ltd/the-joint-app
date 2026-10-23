# Task 1.3 — Private accounts, grants and scoped storage

Predecessor: Task 1.2 PR #9 MERGED at `7741aaf7c0ef8c19f70ff2434901b1a3db7dfc8a`. Final head `59e89111e4ed78c568df2ad61a2a9e499c62c524`, checked test-merge `6b57e8b3e32c071fd772ff5c2d9544fec94b9c77`, Foundation checks SUCCESS, run 39885694072. Branch: build/1.3-private-accounts-and-grants. No Task 1.4 work before this step's PR/current-CI/verified-merge gate.

Everything remains local. GitHub source/synthetic CI are authorised; hosted resources, deployment hooks, previews and paid changes are not. Raw design references and private discovery remain ignored.

## Scope and observable acceptance

Create, list and edit own manual accounts; append dated manual valuations; explicitly set another active adult's NONE/TOTALS/TRANSACTIONS grant. Accounts are private by default, including after a new adult joins. Metadata edits cannot change owner, household or source. Owner-only controls stay distinct from viewing grants and household admin status. No CSV, transaction, holding, bank/broker, wealth-total or child-profile implementation in this step.

Introduce Account, AccountOwner, AccountGrant and immutable BalanceSnapshot with tenant-matched foreign keys, version checks and audit actions. GBP is the initial supported currency, represented as bounded signed integer minor-unit strings; liabilities require nonnegative outstanding debt. Unknown valuation is null, never an invented zero. Manual dates have explicit day precision. Label provenance and freshness on every account card. No fabricated fixture values in the default app.

The first manual creation flow records only the authenticated adult's self-declared sole ownership. It cannot assign a partner or child as legal owner. The model retains canonical ownership terminology; verified joint-owner confirmation and child management must have explicit workflows before those records can be created. Viewing grants never establish ownership. This is an ownership-evidence boundary, not a claim that household assets are all singly owned. Owner-safe joint/archive behavior remains part of the later lifecycle acceptance; no required final product behavior is waived.

## Security and data access

Use a real non-owner `joint_app_runtime` login without superuser, role creation or BYPASSRLS. Migrations use a separate owner URL. Generated local runtime credentials stay in ignored `.env.database`; no secrets printed. API/worker entry points load the runtime configuration. CI provisions its own synthetic runtime role, and tests prove actual connection privileges. No Data API is provisioned; anonymous/authenticated database roles receive no finance-schema/table access.

Enable and force RLS on all finance tables. Every finance query runs inside `withScope`, applying authenticated user/membership/household/session/grant epoch through transaction-local `set_config(..., true)`. Recheck live User, Membership and SessionRegistry; a path UUID never supplies authority. No-scope and cross-household queries return no finance rows. Scope expires with the transaction, including rollback. Use the same physical connection in alternating-tenant tests.

Policy helpers may use narrowly scoped SECURITY DEFINER functions for indexed ownership/grant lookup to avoid recursive RLS. Fix search_path, qualify objects, revoke PUBLIC execution and grant only the runtime role. Verify helper ownership and actual RLS behavior; runtime cannot create/replace helpers or bypass policies. Table ownership alone is not an adequate test role. No dynamic SQL in policy helpers.

`AuthContext` is constructed only by the identity guard and includes userId, membershipId, householdId, sessionId, grantVersion and server-generated requestId plus verified AAL/MFA proof time. Initial financial creation requires verified MFA; sharing widening additionally requires a TOTP AMR timestamp within five minutes. A refresh's JWT issuance time is not reauthentication. Grant changes increment current membership epochs; new requests/cursors recheck them. AccountAccessService requires current owner/grant access and returns 404 for hidden/cross-tenant UUIDs; TOTALS never authorises detail access.

## Interfaces and delivery split

- Parent: shared account contracts/Money helpers, trusted AuthContext/API services and controllers, runtime script wiring/docs and combined verification/delivery.
- Database subtask: Prisma account models/migration, RLS helpers/policies, scoped transaction/runtime-role setup helper and real-role isolation tests. Own only agreed database/test/script files.
- UI subtask: mobile-first `/accounts` and `/accounts/[id]`, actual create/edit/value/sharing forms, focused BFF handlers and browser tests. Reuse evergreen/ivory/sage/apricot tokens and existing identity frame/session boundary. No inert future tabs or pretend bank connections.

Endpoints: `/v1/households/{householdId}/accounts` GET/POST; `.../accounts/{accountId}` GET/PATCH; `.../accounts/{accountId}/valuations` POST; `.../accounts/{accountId}/grants/{membershipId}` PUT. BFF uses fixed routes under `/api/households/...`, the existing opaque Session header, strict schemas, CSRF/origin checks and no-store. Creates/valuations use Idempotency-Key. Metadata uses quoted If-Match account version; grants use quoted grant version (0 means no previous grant). Listing uses bounded, actor/household/grant-epoch-bound opaque cursors; no hidden counts.

## Verification

TDD meaningful boundary cases: other household's known UUID, partner NONE cannot discover account, TOTALS denied TRANSACTIONS scope, viewer cannot write or widen grants, admin cannot override ownership, tenant-mismatched FK rejected, stale versions/idempotency payload conflicts, old/future/absent MFA proof denied for widening, immediate revoked session/membership/grant denial. Real runtime role cannot bypass RLS, owns no tables and cannot access finance without scope; anon/authenticated cannot select finance. Alternate two unrelated households through one pooled connection after success and failure.

Run frozen installation, formatting, lint, strict package/test types, unit/integration/browser tests and builds. Inspect actual account screens at 390/1280px, 320px overflow, keyboard, 200% zoom and reduced motion. Verify real two-adult sharing and downgrade through browser/API. Fresh database migration/seed/runtime setup and clean source install/build must pass. Self-review and fresh independent review precede PR; current-head/test-merge CI and actual authorised merge precede the next step.

## Primary implementation references

- [PostgreSQL 17 RLS and owner/bypass semantics](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).
- [PostgreSQL 17 SECURITY DEFINER/search_path](https://www.postgresql.org/docs/17/sql-createfunction.html).
- [Transaction-local set_config](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-ADMIN-SET).

State: implementing. No PR yet. No later step started.

## Implementation rulings and verification record

- Preserve already-applied local migration history. Corrective policy/privilege changes are additive migrations, not checksum edits or data resets. The migration owner remains separate from runtime.
- Deny runtime identity-parent DELETE and immutable-key UPDATE: PostgreSQL referential cascades can bypass child finance RLS. Only explicit mutable identity/job columns remain writable; fixture expiry/deletion uses maintenance credentials.
- The INSERT RETURNING helper is creator-bound. Hidden partner UUID and unknown UUID both return false; a real-runtime regression reproduced the original distinction and passed after the additive fix.
- Trusted MFA proof must not be in the future. API and database both require an actual TOTP AMR timestamp within the last five minutes for wider sharing. Later password proof and refresh issuance cannot extend it.
- `AccountAccessService.require` takes a bounded array of IDs and returns an authorised scope only when all requested accounts meet the level. Mixed visible/hidden scope is 404; empty scope is invalid. Consumers must still run finance reads under current transaction scope.
- Exact Money parsing and AMR regression tests were observed failing before their fixes. Final local checks and live PR/current-CI/merge evidence remain required; no subsequent step is authorised by a passing development run alone.
