# Task 1.1 — Local vertical slice

Base: Task 0.5a PR #7, merged at `2eb7c6a7b5888cf6088bf432b45c5af4d08a0398`; head `0d8ecab0a36fe59266bbabbc08a59854e80ee50f` and test-merge `440bda5a744b948c64c4bdbc8867ca43f538865b` passed Foundation checks, run 39878441329. Implementation branch: build/1.1-local-vertical-slice.

All execution/data remain local until the MVP is complete and explicit deployment approval is given. Existing Vercel Pro and a free database are future compatibility targets only. No deployments, hosted previews, cloud provisioning, billing changes or new paid services.

## Scope and acceptance

1. Reuse B0 workspace/environment/health checks. Add pinned Prisma 7.10.1, its client and pg adapter; Prisma migrations are the only app-schema history. Generate the client reproducibly, migrate and idempotently seed two synthetic households.
2. Implement PostgreSQL Job/Outbox with tenant-matched references, idempotency, SKIP LOCKED claims, per-attempt fencing, bounded leases/heartbeat, cancellation and bounded retry/backoff. Test concurrent claims, duplicate delivery, crash recovery, stale completion, expiry during transaction, failure rollback, atomic domain/outbox commits and attempt exhaustion against real PostgreSQL.
3. Share a bounded job runner with the independently runnable local worker. Unknown types remain unclaimed. Test batch limits, cancellation and failures. Keep synthetic import handlers in tests; actual CSV processing is Task 1.4.
4. Add a harmless authenticated bootstrap read from web through API to DB. Use a maintained JWT/JWKS verifier, pinned issuer/audience/algorithm and server-derived session/membership. No dev-auth bypass or trust in client household claims. Test invalid/missing/expired tokens, revoked sessions and cross-household claims. Local synthetic signing keys exist only in test fixtures. Supabase sign-in, cookies/refresh, invitations and MFA are Task 1.2; bootstrap must fail closed until configured and provisioned.
5. Update setup/CI for migrations, generation, seed and tests. Verify frozen install, formatting, lint, types, unit/integration/browser tests, builds and independent/combined starts. Review all changed files before PR; current CI and actual merge are required before Task 1.2.

## Interface rulings

- B0 already implements scaffolding and health routes: extend them rather than regenerate.
- Task 1.2 owns login/session lifecycle; Task 1.1 provides verification and the minimal registry read needed for a real authenticated request. No homemade login UI or fixed test token in production.
- Task 1.3 owns account grants and scoped finance RLS. No financial tables/endpoints exist here; do not claim production tenant security is complete.
- Job and outbox schemas are production foundations. Synthetic import domain writes are test-only household revision changes, not a pretend CSV parser.
- Do not create empty domain/entitlement/test-fixture packages. Add them when real shared implementations exist; tests keep their fixtures locally for now.
- Future hosted execution runs bounded batches. The local worker remains independently runnable; no Function depends on a permanent timer or process.

## State

Local implementation verified; independent review and fresh-checkout verification pending before PR. Five unit tests, sixteen integration tests and three browser tests passed. PostgreSQL stop/recovery preserved liveness; combined pnpm dev started all three processes. No later task started. Authoritative final revisions/check/merge evidence will be recorded in docs/progress.md and the step PR.
