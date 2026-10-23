# Task 3B — Manual wealth valuation implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task. The sections below are implementation slices of ONE standalone delivery step, not permission to start Task C. Parent review approved this bounded plan before implementation.

**Goal:** Return reproducible, permission-scoped manual GBP wealth through `GET /v1/households/:householdId/wealth`.

**Architecture:** A pure domain helper values immutable manual snapshots selected by a scoped API repository. The service performs fresh authorization and source checks before returning; it persists no derived result. Owner attestation travels with each original valuation. Runtime writes to existing goal/projection tables remain disabled.

**Tech Stack:** Existing NestJS, Prisma/Postgres, TypeScript, Zod, bigint, Vitest and Playwright; no dependency additions.

**Spec:** `docs/joint-app/phases/03-wealth-and-goal-projections.md` Task B; `docs/joint-app/03-data-model-and-financial-rules.md` sections 4, 5, 8; `docs/decisions/release-scope.md`. Apply AGENTS.md and BUILD.md.

## Global constraints

- Integer minor units; HALF_UP when rounding is necessary. This step only adds/subtracts exact integers.
- Tenant-scoped repositories/RLS, explicit account grants, no money movement, no LLM calculations, child ownership preserved.
- Manual GBP only. No connector, holding, FX, child profile, goal writer, projection calculator or Task E screen.
- Predecessor evidence supplied by parent: PR 14 merged, head `8df0cea`, CI `39917014570` successful, test merge `cba157a8c5e7baf45de1e0d425410576225333b0`; base `b56905901c21faaf78575f04cd638c2512b637b4`. Parent owns live verification and progress record.
- Task 3B has its own PR; current-revision complete CI and verified merge are required before Task C. Existing goal storage remains runtime-default-deny.

## Review focus

1. Legacy unclassified balances and mixed adult/earmarked money must not become adult assets through defaults.
2. A permission withdrawal, logout, household exit or account archive during computation must prevent a stale authorized response.
3. Invisible-account activity and transaction-only edits must not change the public wealth provenance.
4. Negative current balances, positive outstanding debts and duplicated canonical accounts must not inflate assets or subtract debt twice.
5. Old, future-dated, incomplete or absent snapshots must not become fresh or falsely complete through a later read.

## Decisions and wire contract

### Owner attestation

Add one nullable `adultAmountMinor BigInt?` to `BalanceSnapshot`. Its API form is `adultMoney: Money | null`. It means the owner-attested adult portion of the recorded balance, not available-to-spend cash. NULL means unknown, including all legacy rows. Do not backfill unknown ownership to full adult ownership from ADULT/JOINT_ADULT legal account labels. Legal title alone does not disprove earmarking.

For nonnegative original money require `0 <= adultAmountMinor <= amountMinor`; for negative original money permit only the identical negative amount. A known nonadult positive balance is represented by adult amount zero. Mixed £10,000 money with £3,000 earmarked has original 1000000 and adult 700000. The attestation concerns the household adults, not age-based eligibility of unrelated owners. No identity, child name, beneficiary profile or inferred child asset total is added. Negative assets cannot erase obligations by declaring an adult zero portion. Liability kinds retain positive outstanding balances and require an attested adult amount equal to the full outstanding amount; partial liability attribution is unsupported. Null attestation excludes that account from both numerical results and marks incomplete.

Extend `valuationInputSchema` with optional nullable `adultMoney`; omission writes NULL for backward compatibility. Preserve omitted input during idempotency hashing, and parse historical stored valuation responses with an explicit null default so old replay records remain readable. Strict validation rejects different currencies and impossible portions. Preserve source `money` byte-for-byte semantically. Owners correct attestations by writing a new snapshot under existing If-Match/idempotency controls. No update-in-place history rewrite. Add the field to valuation responses, archive and export projections. TOTALS access permits this valuation-level amount but never transaction or holdings details.

No Phase E screen is necessary: API owners may submit the field. Existing valuation UI can continue writing unknown evidence safely; it does not silently attest ownership. This intentionally means legacy/manual UI balances will be excluded until an owner explicitly supplies an attestation. A later UI step can expose the control.

### Provenance without a global financial counter

Replace the unused wealth DTO's numeric `scope.datasetVersion` with `scope.sources`, a sorted exact vector of `{accountId, totalsVersion, valuationId: string | null}`. Keep `scope.kind = VISIBLE`, sorted `accountIds` and existing caller `grantVersion`; `sources` must contain precisely those account IDs once. Use `Account.totalsVersion` even for owners: transaction edits change owner versions but do not change wealth. Missing valuation is represented explicitly. Existing triggers advance totalsVersion for metadata and snapshot changes; no household counter, hash-as-Int, truncated digest or count of hidden rows.

Retain `valuations` as references to selected snapshots, including excluded ones so dates explain staleness. Add `calculatedAt` (injected ISO timestamp). `asOfDate` is the injected London evaluation date, not a claim all observations share that date. No live sync occurred; references explicitly say MANUAL.

Do not modify dormant ProjectionRun.datasetVersion in this bounded step. No wealth writer consumes that field. Task D must resolve its provenance contract before activating a writer, using the same exact source vector plus valuation IDs. This is an explicit deferred prerequisite, not a fabricated current revision. Changing the currently unexposed wealth contract before its first endpoint is safer than publishing a meaningless counter. Update its contract fixtures now; do not rewrite old applied migrations or weaken projection evidence guards.

Make `adultNetWorth` and `liquidAdultAssets` nullable aggregate Money. If there are valid contributions, return their subtotal with PARTIAL where some scoped evidence is unavailable. If no evidence contributes, return null, never fabricated zero. Known adult zero is valid evidence and returns zero. Add excluded reasons `UNKNOWN_ADULT_PORTION`, `INCOMPLETE_VALUATION`, `FUTURE_VALUATION`, `INVALID_VALUATION`; retain NO_ACCOUNTS, MISSING_VALUATION, STALE_VALUATION, UNSUPPORTED_CURRENCY. Reasons are distinct, sorted, based only on visible inputs. Known earmarked exclusions are intentional and do not themselves make adult coverage incomplete. Scope is always VISIBLE, never a claim of complete household visibility.

## Task 1: Evidence contracts and lifecycle

**Files:** modify `packages/contracts/src/accounts.ts`, `wealth.ts`, `packages/database/prisma/schema.prisma`; create a new timestamped migration directory `*_manual_wealth_attestation/migration.sql`. Modify `apps/api/src/modules/accounts/account-mutations.ts`, `account-projection.ts`, `apps/api/src/modules/archive/archive-projection.ts`, `packages/contracts/src/exports.ts` and `apps/worker/src/exports/csv.ts` only if the existing generic CSV details field cannot represent nullable adult amounts compatibly; update the export snapshot projection in existing export SQL. Create `tests/wealth-evidence.test.ts` for focused attestation cases; modify `tests/wealth-goal-contracts.test.ts`, `tests/accounts-api.integration.ts`, `tests/exports.integration.ts`, `tests/export-privacy-fences.integration.ts`; create `tests/wealth-evidence.integration.ts`.

**Interfaces:** `ValuationInput.adultMoney?: Money | null`; valuation response `adultMoney: Money | null`; Prisma snapshot field `adultAmountMinor: bigint | null`. Export nullable adult amount explicitly, distinguishing empty unknown from zero.

- [ ] Write failing contract cases for unknown, zero, mixed portions, currency mismatch, excessive portions and invalid negative portions. Write DB/API cases proving owners alone can attest, stale If-Match fails, same key/body replays, altered attestation with same key conflicts.
- [ ] Run `pnpm exec vitest run tests/wealth-goal-contracts.test.ts` and `pnpm test:integration tests/wealth-evidence.integration.ts tests/accounts-api.integration.ts`; verify new assertions fail for missing behavior.
- [ ] Add nullable storage with database CHECK constraints for bounds and applicable account-kind validation in the existing scoped writer; ensure direct runtime statements cannot bypass liability validation (a narrowly scoped trigger if cross-table validation is needed). Preserve original money and historical rows.
- [ ] Inspect existing snapshot export functions and replace only the relevant projection with adult amount. Existing statement triggers advance TOTALS epochs and export fences for snapshot insertion/update/deletion; prove the new field participates. Do not create a separate consent grant: it is valuation data covered by existing TOTALS consent.
- [ ] Test archive reads, free exports after downgrade, leave/deletion ownership behavior, stale downloads after valuation changes, revoked grants and export regeneration. Preserve author/tenant links and existing deletion cascades. Test upgrading a populated pre-step DB leaves adult amounts null and original money unchanged.
- [ ] Rerun affected tests; inspect SQL grants/search_path, lock order and export schema/version compatibility. Preserve existing export consumers or deliberately version the export shape with compatibility tests.

## Task 2: Pure arithmetic

**Files:** create `packages/domain/src/wealth/types.ts`, `value-accounts.ts`, `tests/wealth-valuation.test.ts`; export via existing domain package exports/index. Use test-local fixtures consistent with the existing test structure rather than create an empty fixture package.

**Interfaces:** `valueAccounts(input: WealthValuationInput): WealthSummaryDto`. Input contains householdId, grantVersion, asOfDate, calculatedAt and readonly scoped accounts; each account has id, kind, legalOwnerKind, liquidity, totalsVersion and nullable snapshot `{id, money, adultMoney, asOfDate, complete, source}`. No database, network, clock or FX parameter. The scope repository constructs trusted input; helper still rejects contradictory duplicate IDs instead of silently choosing evidence.

- [ ] Write independent golden assertions: £7,000 adult plus £3,000 earmarked gives £7,000; mixed £10,000/£7,000 preserves original and counts £7,000; unknown alone gives null/PARTIAL; known adult zero gives zero/COMPLETE.
- [ ] Assert £10,000 broker account total remains £10,000 without adding hypothetical cash/holdings; identical canonical joint account counts once, contradictory duplicate fails. Property £200,000 less separate mortgage £150,000 gives £50,000. CURRENT and SAVINGS overdrafts -£500 each contribute -£500 net worth and zero liquid assets. Pension £20,000 RESTRICTED contributes net worth and zero liquid assets.
- [ ] Assert liability amounts are positive and subtracted once. Liquid assets include only positive adult assets marked AVAILABLE; exclude PENSION and PROPERTY regardless of misleading liquidity. Liabilities never contribute liquid assets. Unsupported negative asset evidence outside CURRENT/SAVINGS is excluded as INVALID_VALUATION; no absolute-value normalization.
- [ ] Assert exactly 30 calendar days old is accepted, 31 excluded, future date excluded; complete=false excluded; missing/unsupported currency excluded; all-excluded returns null. Valid subset returns labelled PARTIAL subtotal. Identical input yields identical output across time zones and reordered input.
- [ ] Run `pnpm exec vitest run tests/wealth-valuation.test.ts` to establish failures, implement exact bigint arithmetic and stable ordering, rerun to pass. No rounding or conversion is introduced.

## Task 3: Authorized bounded endpoint

**Files:** create `apps/api/src/modules/wealth/wealth.repository.ts`, `wealth.service.ts`, `wealth.controller.ts`, `tests/wealth-api.integration.ts`; register in `apps/api/src/application.ts`. Add strict wealth query schema in contracts; use existing query/scope validators.

**Interfaces:** `WealthService.read(context: AuthContext, accountIds?: readonly string[]): Promise<WealthSummaryDto>`; repository `readWealthScope(tx: Prisma.TransactionClient, context: AuthContext, accountIds?: readonly string[]): Promise<readonly ScopedWealthAccount[]>`. Controller follows the existing controller factory and financeContext pattern.

- [ ] Write HTTP and restricted-role tests for owner/TOTALS success, NONE/cross-household non-disclosure, inactive actor/session rejection, duplicate/malformed query rejection, absent scope default, and explicit scope <=50. Query visible active accounts with take 51; if default visible set exceeds 50 return generic SCOPE_REQUIRED without account counts. Explicit mixed authorized/unauthorized IDs fail as a whole under existing non-disclosing policy.
- [ ] Run `pnpm test:integration tests/wealth-api.integration.ts`; confirm failures, then implement minimal select of accounts and one latest balance ordered by asOfDate DESC, createdAt DESC, id ASC. Reuse existing RLS client, not owner connection. No transaction, import, goal or holdings reads.
- [ ] Evaluate with injected London date/current timestamp. Re-read scope and exact source vector immediately before return, and execute fresh `app.scope_is_valid()` in that transaction. Fail SCOPE_CHANGED on source/grant drift. Use existing READ COMMITTED semantics so the second read sees intervening commits; never retry forever. No cache; send Cache-Control: no-store on route and applicable errors.
- [ ] Add barrier-based races committing revocation, archive, logout, exit and new valuation between initial read and final validation. Each must fail closed or return only freshly authorized data. Add tests where a private account or transaction-only edit changes: output provenance remains unchanged (apart from calculatedAt). Add bounded query/count assertions and prove TOTALS cannot fetch details through this route.
- [ ] Re-run tests and existing isolation/export suites. Do not weaken timeout assertions or remove race barriers to hide host pressure.

## Final verification and delivery

- [ ] Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, targeted integration suites above, `pnpm test:integration`, and `pnpm test:e2e`. Run disposable fresh migration and populated upgrade checks through existing database scripts. Review every changed file and diff.
- [ ] Resource pressure previously blocked full local integration while targeted local 173 unit/7 DB/11 browser and predecessor CI passed. Those are predecessor evidence, not proof for this change. Record exact current failures and retry after removing only task-owned workloads; retain fixtures/deadlines. Complete current CI remains mandatory.
- [ ] Parent updates existing progress record, commits/pushes this single build step and raises its PR. Independent review covers the five failure classes above. Wait for all applicable current-head/test-merge checks and required reviews, then merge only within authorization. Record actual host merge evidence before starting later work.

## Rollout and recovery

Additive nullable storage preserves prior server writes: omitted attestation stays unknown. Deploy schema before new readers/writers; do not drop or reclassify balances. Existing strict clients may reject new response properties: coordinate contract/server release and verify old client behavior before rollout. Disable the wealth route or restore compatible prior API code on regression; leave attestations and original evidence intact. Recompute derived totals after fixes. Privacy revocation, deletion and free exports continue; no rollback may reintroduce complete adult totals from unknown evidence. No production deployment is authorized by this planning document.
