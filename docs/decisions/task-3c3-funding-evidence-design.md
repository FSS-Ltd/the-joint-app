# Task 3C.3 — Owner funding evidence

## Problem and scope

The pure funding rules require settled adult cash and bill reserves. Neither can be inferred from an account balance, a read grant or category underspending. Provide an independently usable owner-only attestation API with immutable provenance, history and export before activating allocation writers. This is a prerequisite within Phase 3 Task C, not completion of Task C. No UI, transfer, allocation writer or deployment belongs to this step.

Predecessor: [PR #17](https://github.com/FSS-Ltd/the-joint-app/pull/17), merged as `84ab0d43eee852dba1b8df82b9784dd37d2d29a2`. Required CI `39935942660` succeeded on its final head `8b043d250b5ffe77d079d2c43804369b58e4c30a`; main CI `39936904269` succeeded on the merge. Revalidated from GitHub before this branch.

## Data and authority

Add append-only `FundingEvidence`: UUID identity, tenant-matched source account and valuation, author membership, per-account positive integer version, settled adult minor units, bill-reserve minor units and database timestamp. GBP only, exact signed-int64 bounds, explicit nonnegative settled/reserve amounts. Missing evidence remains unknown. Do not backfill or modify source balances.

Only a current account owner can record or read current evidence. TOTALS and TRANSACTIONS grants do not grant access. Source must be the latest manual, complete, GBP adult/joint-adult valuation, dated within 30 London calendar days, neither future nor stale, on an available current/savings/investment/other-asset account. Known adult amount bounds settlement; negative bank balances permit settled zero. Reserves may exceed settlement; that does not prove spare cash.

Settlement is pinned to a named immutable valuation. Later evidence for that valuation may change reserves but must retain the same settlement. Correction requires a new source valuation, retaining its truthful as-of date. This keeps historical fraction bases unambiguous without rewriting evidence. Costs: one additional owner action for settlement corrections; no inference or automatic cash classification.

Runtime cannot directly read or mutate the table. Narrow security-definer functions validate scope, lock User → Household → Account, then recheck ownership and source. Append checks the expected private funding version under the same lock. A database trigger enforces immutable source/bounds and same-valuation settlement even for maintenance inserts. Deletion is allowed only through parent account/source cascades. Existing account, totals and wealth response versions stay unchanged on funding evidence writes; emit only the generic audit action.

## Exit, deletion and recovery

Add `AccountOwner.fundingCutoffVersion`, default zero. On ACTIVE → ARCHIVED capture the account's current evidence version; preserve that cutoff thereafter, regardless of submitted values. Archive reads require the existing authenticated owner-archive scope, LEFT membership and archived ownership. They return only evidence at or below that cutoff, never a remaining joint owner's later planning details or current valuation metadata. Existing archived owners receive no invented historical rights.

Sole-owner source deletion cascades evidence. A remaining active joint owner justifies retained evidence; if all surviving owners are archived, purge evidence above their greatest frozen cutoff when the last live owner is deleted. The deleted author's membership is minimal provenance, not exported identity. Actual privacy-worker purge and restored-journal replay must prove both retention and deletion behavior. No new retention exception or widening of account archive access.

## Interfaces and safe failures

`POST /v1/households/:householdId/accounts/:accountId/funding-evidence`: strict `{valuationId, settledAdultMoney, billReserves}` with GBP money objects; UUID Idempotency-Key and quoted If-Match private version (zero initially). Replay digest includes expected version and normalized input; exact retry returns its original evidence after fresh owner authorization, never silently reinterprets a request.

`GET` at the same path returns `{current, history, nextCursor}`; current is the latest authorized evidence or null, history has at most 50 entries. Each entry identifies source valuation and immutable amounts/version/time, without author identity. The current active source valuation ID is not needed in this response: clients already obtain it through the account interface. Evidence may reference an older source; it cannot be treated as currently eligible without rechecking that source.

`GET .../export` returns the same bounded JSON page as a free attachment with fresh MFA. `/v1/me/archive/accounts/:accountId/funding-evidence` and `/export` provide read-only frozen equivalents. Cursors are encrypted and bound to user, session, account, mode and active household/membership/grant context; canonicalize UUIDs. Each page rechecks authority. Export is a sequence of authorized pages, not a point-in-time whole-account dump.

Missing/foreign/non-owner resources return the same 404. Expected-version conflict returns 409 `VERSION_CONFLICT`; stale/incomplete/ineligible source returns 409 `FUNDING_UNAVAILABLE`; settlement rewrite returns 409 `SETTLEMENT_IMMUTABLE` with an instruction to record a new valuation. Invalid syntax returns 400 without submitted values, SQL details or credentials. Everything is no-store. Funding evidence does not claim funds have moved or been allocated.

## Verification and rollout

Test exact values above Number.MAX_SAFE_INTEGER; zero/negative-source handling; source bounds, age, ownership and eligibility; direct runtime denial; immutable evidence; concurrent same-version writes; replay; pagination/cursor binding; source changes; view-only grants and unchanged source versions; joint exit cutoff; actual purge and restore replay. Apply additive migrations to a fresh owned database and test upgrade with existing valuations/archived owners. Preserve persistent development data. Run frozen installation, formatting, lint, type checks, unit/integration/browser tests and builds in an exact clean checkout. One independent whole-branch review precedes PR, latest-revision green CI and authorized merge.

No new dependencies. Recover schema defects with forward migrations; never edit applied migrations or discard financial history. Keep allocation/contribution/projection activation behind subsequent build gates. All services remain local.
