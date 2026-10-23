# Owner Funding Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist and expose owner-controlled, immutable settlement/reserve attestations with frozen archive history.

**Architecture:** Private PostgreSQL table, tenant-matched references and narrow scope-checking functions. Thin NestJS controllers use strict Zod contracts, existing scoped transactions, encrypted replay and encrypted pagination.

**Tech Stack:** Existing pinned Node, TypeScript, NestJS, Prisma, PostgreSQL, Zod and Vitest. No new dependencies.

**Spec:** [Funding evidence design](task-3c3-funding-evidence-design.md).

## Global Constraints

- Exact GBP minor units; no legacy inference, transfers, allocation writers or deployment.
- Source ownership controls evidence; read grants never confer control or evidence access.
- Preserve original valuations and public source versions; private funding versions are independent.
- Existing primary checkout and dedicated branch; verify against fresh owned database, preserving development data.
- One independent whole-branch reviewer, local checks before PR; verified current CI and host merge before the next step.

## Review Focus

- A delayed write after source/ownership change must recheck under locks, not trust the HTTP context.
- Joint-owner exit must freeze private planning even when asset archive rules retain source access.
- Settlement correction must not rewrite a historical fraction basis or falsely refresh a valuation.
- Replay and cursor reuse must neither disclose other sources nor apply an old request twice.
- Privacy deletion and restored-journal replay must purge exclusive data while preserving independently justified joint data.

### Task 1: Storage and contracts

**Files:** `packages/database/prisma/schema.prisma`, additive migration `20261023082000_owner_funding_evidence/migration.sql`, `packages/contracts/src/funding-evidence.ts`, contracts index, `tests/funding-evidence.integration.ts`, `tests/funding-evidence.test.ts`.

**Interfaces:** Produces `FundingEvidenceDto`, `FundingEvidenceWrite`, `FundingEvidencePage`; SQL `app.write_funding_evidence(account_id uuid, expected_version integer, input jsonb)` and `app.read_funding_evidence(account_id uuid, after_version integer)` returning validated JSON. Read SQL uses `nextAfterVersion`, public pages use opaque `nextCursor`.

- [ ] Write tests for exact amounts, strict payloads, owner-only evidence, eligible source bounds/freshness, immutable same-valuation settlement, reserve updates, direct runtime denial and concurrent optimistic writes.
- [ ] Run `pnpm test -- tests/funding-evidence.test.ts` and targeted integration tests. Expected: missing exports/functions fail before implementation.
- [ ] Add contracts and private append-only storage/functions, owner exit cutoff and Prisma relations. No balance/version changes or legacy backfill.
- [ ] Run the same tests against a fresh disposable database. Expected: all targeted cases pass. Commit the verified storage/contracts change.

### Task 2: Owner API and lifecycle

**Files:** `apps/api/src/modules/funding-evidence/` focused service/controller/archive-controller/cursors/query-error modules; existing identity service composition; `tests/funding-evidence.integration.ts`, HTTP/service tests, existing privacy/restore fixtures and proof helpers.

**Interfaces:** Consumes Task 1 DTO/write/page and SQL functions; produces current/archive GET and fresh-MFA JSON export plus owner POST with idempotency and expected version. No source or funding IDs in unrelated projections.

- [ ] Add failing service/HTTP and integration tests for replay, malformed inputs, cursor binding/pagination, stale scope, view-grant denial, source version stability, joint archive cutoff, deletion and real restore replay.
- [ ] Run targeted tests. Expected: new behavior fails before implementation.
- [ ] Implement focused service and thin controllers with existing authorization, replay, vault and safe error conventions. Connect to existing service factory. Extend restore proof with exclusive/joint evidence and post-exit reserve privacy.
- [ ] Run targeted tests, fresh migration/upgrade and complete clean-checkout frozen install, formatting, lint, builds, type checks, unit/integration/browser suites. Expected: all pass; source hashes unchanged.
- [ ] Self-review every changed file; obtain whole-branch review and fix material findings with a failing regression first. Record verification and actual predecessor merge in progress. Commit, open/attach PR, require latest CI success, merge within existing authority and record actual merge evidence.
