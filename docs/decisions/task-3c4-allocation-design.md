# Task 3C.4 — Atomic owner-controlled goal allocations

## Purpose and boundary

Complete the existing-assets portion of Phase 3 Task C. Shared goal metadata and owner funding evidence already exist. Activate atomic allocation replacement, current assessment, frozen history and free export. Future contributions, scenarios, projection calculation and screens remain later units. No money moves, no new dependency/service is needed and nothing is deployed.

Use the existing exact GBP funding rules. Only a current source owner who participates in the goal can commit an intention. A viewing grant or household membership alone grants no control. Joint owners serialize on the same canonical account. Keep child profiles, non-GBP conversion and direct providers deferred.

## Explicit source scope and concurrency

A request selects one to fifty distinct controlled account IDs. It replaces only this goal's intentions for those selected accounts; omission within that selection releases an intention. Other accounts and other owners' intentions remain unchanged. Validate the whole selection before returning amounts or changing anything. Cross-tenant, nonexistent and uncontrolled resources receive the same non-disclosing denial.

Use the goal metadata version in If-Match and an exact per-account allocation-version vector in the body. A private account counter advances for changes to its commitments, including releases. This avoids a global funding counter exposing changes in another adult's private accounts. A co-owner sees the same source version because both control that canonical source. The dormant allocation DTO may be revised before its first runtime endpoint; use a versioned contract with explicit scope rather than publish a misleading single funding version.

Lock the actor, household, selected accounts in UUID order and goal using the existing transaction conventions. Recheck live session, membership, goal participation and ownership after waiting. Compare every expected source version under lock. Read all active intentions for each source, including other goals, and the immutable settlement basis for historic fractions. Apply all selected changes or none. Two concurrent £300 claims against £500 permit at most one. A multi-source failure leaves no history, audit, replay or notification behind.

Fixed amounts and fractions retain their valuation references. Fractions resolve against the settlement at their recorded valuation using exact HALF_UP arithmetic. Current eligibility uses the latest complete manual adult valuation and its matching settled/reserve evidence, including the existing 30-day freshness rule. Reserve excess clamps availability to zero. No evidence is inferred from legal title, viewing grants, net worth, credit limits or unsettled assets. Underfunded intentions survive a valuation fall; allow safe reductions/releases, not increased overcommitment. Unavailable sources permit release, not new commitments.

## Storage and lifecycle

Add a private per-account allocation state and append-only per-account revision ledger. Each revision records one goal's intention or explicit release. Current GoalAllocation rows reference their verified source revision; pre-existing dormant rows remain unverified and default denied, with no invented history or ownership. Encountering unknown legacy commitments blocks capacity admission safely rather than ignoring them.

Extend AccountOwner with an allocation-history cutoff captured on exit. Frozen archive reads require both source-owner archive rights and the goal's existing frozen participant rights. Later co-owner changes cannot appear in that archive. A goal archive releases its live commitments atomically while preserving authorized history; it does not move money. If a source loses its last active owner or is archived, release its active commitments after preserving applicable exit cutoffs. Keep existing shared metadata and source evidence versions independent.

Actual privacy purge and restored-journal replay remove exclusive data and revisions no surviving owner/participant can justify. Preserve independently justified joint history and exact surviving timestamps. Parent deletion must clean new rows without blocking existing privacy operations. No direct runtime table privilege or session flag can enable history rewriting. Use additive migrations; never rewrite applied migrations or backfill legacy financial evidence.

## API and events

Thin authenticated household/goal allocation controllers call a focused scoped service. Canonicalize UUID case and source ordering for idempotency hashes. Check current authority before encrypted replay; a replay never creates another revision. Cursor tokens bind user, session, active/archive scope, goal and selected accounts. History/export pages are bounded at fifty and exports remain free with fresh MFA. Read APIs are no-store; no recurring polling is introduced.

Commit empty PostgreSQL change hints only after durable allocation changes. Rollbacks and exact replays emit no new change. Future web subscriptions will reconcile authorized reads at startup/reconnect using the existing transport pattern; this backend unit adds no empty UI, client polling or new event service.

## Verification and recovery

Prove strict contracts, exact money/fraction boundaries, atomic multi-account admission, canonical co-owner races, stale versions, delayed ownership/valuation/exit changes, expired sessions, read-grant denial, tenant isolation, unavailable-source release, frozen archives and fresh-MFA/free exports. Verify commit/rollback/replay notifications and actual purge plus isolated restore replay. Rehearse a populated upgrade without inventing allocation history. Run the full existing checks and one independent branch review before PR/CI/verified merge.

Disable allocation routes on regression, retaining immutable evidence and source balances. Correct data only through reviewed forward fixes. No automatic reallocation, transfer, trade, entitlement widening or deployment is authorized by this unit. UI work must use the approved private references and current DESIGN.md, including UI8 glass, when Phase 3 Task E begins.
