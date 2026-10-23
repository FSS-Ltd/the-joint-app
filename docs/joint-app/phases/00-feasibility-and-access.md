# Phase 0 — Feasibility and Access Implementation Plan

> **CSV-first MVP revision, 23 October 2026:** Direct bank connections and bank procurement are post-MVP by founder instruction. The current MVP uses CSV/manual records; historical live-bank prerequisites and live-refresh paywall promises below are deferred. Provider evidence remains required before future live work. No live broker connector is included in the CSV-first build; its separate permission gate remains. See the [canonical scope revision](../01-product-specification.md).

**Goal:** Resolve the facts that could make the planned connected product impossible or uneconomic, and establish an executable baseline.

**Architecture:** Confirm a cloud-backed TypeScript app with local inference and explicit provider boundaries. Use research, synthetic fixtures and targeted permitted spikes.

**Tech stack:** Next.js, NestJS, PostgreSQL/Prisma, Supabase Auth, Expo later, Ollama companion later.

**Specs:** [product](../01-product-specification.md), [architecture](../02-architecture-and-project-structure.md), [integrations](../04-account-integrations.md), [AI](../05-local-ai-and-projections.md), [commercial](../06-paywalls-and-mobile-launch.md).

**Effort:** 3–5 engineer-days, plus external response time. **Entry:** These proposed requirements are available; no real provider access is assumed.

## Global constraints

UK first, GBP default, Europe/London dates, two individual adult users, parent-managed children, read-only integrations. Never store credentials in these documents. Trading 212-specific development/use for the intended shared product waits for the written permission gate. No automated money movement or securities recommendation.

## Review focus

Exact bank-product coverage; personal versus shared/commercial use rights; an aggregator's actual UK role; cost of two consenting adults; local model size versus usable RAM. Each has an evidence task below.

## Task 0.1 — Establish the founder account inventory

**Files:** create `docs/decisions/account-inventory.md` and `docs/decisions/scope-baseline.md`.

**Interface:** Inventory rows contain provider name, country, product type, owner category, currency, intended visibility, needed balances/transactions/holdings, expected history and import availability. They contain no account numbers, balances, tokens or passwords.

- [ ] Record the actual banks, savings products, cards, loans, pensions, Trading 212 account types and children's providers the founders want represented.
- [ ] Mark whether each asset is adult-owned, jointly owned or child-owned and whether it is liquid/restricted/locked.
- [ ] Assign each row a connectivity status: unverified, supported-pending-approval, approved-for-test, approved-live or manual-only.
- [ ] Record the agreed founder scope and the exact public-MVP promise; keep unsupported providers visibly outside live claims.

**Acceptance:** Every desired account category has an owner, required data and a proposed import/connectivity route. An absent account inventory is an open dependency, not a reason to invent banks.

## Task 0.2 — Resolve bank procurement and the AIS arrangement

**Files:** create `docs/decisions/provider-gates.md` and `docs/decisions/bank-provider-comparison.md`.

**Interface:** Gate record: `{id, status, owner, evidenceRef, checkedAt, recheckAt, permittedScope, blockedTasks}`.

- [ ] Prepare a short vendor brief: UK adult couples, separate identities, shared budgeting, read-only data, local AI evidence processing, expected pilot size and planned commercial release.
- [ ] Request or obtain the approved route, actual institution/product coverage, sandbox/production eligibility and regulatory/principal/agent responsibilities through an authorised process.
- [ ] Obtain prices for two founders and 100/1,000 households, including minimums, active-user/connection/account/request charging, refresh rules, reconnects, retention and termination.
- [ ] Compare TrueLayer Data v3 first, Plaid Custom second, and Enable Banking only if actual UK coverage and use rights are confirmed.
- [ ] Select one bank adapter only after B1–B3 evidence supports it; otherwise continue generic/manual work and record a blocked live gate.

**Acceptance:** Decision names the actual production path, permitted use and quoted billing units. A public pricing page or free sandbox does not satisfy this task. Contacts/applications are future implementation actions, not messages sent during plan preparation.

## Task 0.3 — Resolve Trading 212 permissions before specific implementation

**Files:** add T1/T2 records to `docs/decisions/provider-gates.md`; create `docs/decisions/trading212-scope.md`.

- [ ] Record the relevant account entities/types and the precise intended personal, partner-display and future commercial use.
- [ ] Obtain written permission covering the custom interface, development for other users, data display/redistribution, hosting, retention and read-only processing.
- [ ] Confirm account/portfolio/history permissions and static-egress requirements against current documentation and any approval conditions.
- [ ] Keep provider-specific app work blocked while T1 is unresolved; design generic adapters and CSV workflows independently.
- [ ] After approval, plan a supported account reconciliation and credential-scope check without sending any trade.

**Acceptance:** Permission scope and constraints are explicit. A generated API key, a demo success or the spouse's consent alone does not satisfy T1. If permission is refused, revise the release promise visibly and retain statement-based investment tracking.

## Task 0.4 — Verify architecture, versions and model feasibility

**Files:** create `docs/decisions/version-matrix.md`, `docs/decisions/architecture-baseline.md` and `docs/decisions/local-ai-benchmark-plan.md`.

**Interface:** Record exact versions/licences, runtime platform, model tag/digest, context limit and benchmark fixture version.

- [ ] Check current stable supported versions and compatibility for the chosen TypeScript/Next/React/Nest/Prisma/Expo/Supabase toolchain; pin a proposed matrix.
- [ ] Confirm London availability and required auth/database features, connection pooling, backup options and regional data-flow limitations.
- [ ] Confirm the pilot computer model/RAM, whether it is always available, and whether each adult is comfortable approving sensitive evidence to that computer.
- [ ] Define the E4B Q4_K_M/E2B evaluation at 4K context; record download size separately from runtime RAM.
- [ ] Run only an authorised synthetic local feasibility benchmark if the real Mac is accessible; otherwise mark it unmeasured and retain the Phase 4 benchmark gate.
- [ ] Record the server-only web auth/BFF design and native secure-session design as an explicit decision for Phase 1 validation.

**Acceptance:** No “latest” placeholder drives a build; no 16 GB performance promise is made without measurement. The cloud dev environment in which a plan is written is not the user's Mac and cannot prove its performance.

## Task 0.5 — Lock release gates, cost ceilings and evidence structure

**Files:** create `docs/decisions/launch-gates.md`, `docs/decisions/cost-model.md` and `docs/decisions/release-scope.md`.

- [ ] Separate fixed infrastructure, variable provider fees, store/billing charges, professional review and developer effort.
- [ ] Calculate monthly/annual unit economics using the actual quote where available; label all other variables as assumptions.
- [ ] Define founder production gate, external beta gate and public paid gate with named evidence owners.
- [ ] Record the legal entity/provider/perimeter/privacy questions for qualified review before the corresponding real-data/public action.
- [ ] Preserve the six-phase dependency graph and mark parallel tasks that can proceed if procurement is delayed.

**Acceptance:** No claim that the tentative Plus price is viable before quotes. No live founder-MVP declaration with missing real bank or approved brokerage evidence.

## Exit, verification and handoff

Review the inventory and gate files against every R01–R16 requirement. Verify links, check dates, scope labels and that no secret/personal financial content entered the repo. A documentation review is the meaningful check for this phase; do not create fake unit tests for research.

**Pass:** baseline and gates are explicit, safe independent implementation can begin, and unresolved approvals have owners. **Connected go-live pass:** additionally requires the actual relevant permissions. Phase 0 can permit Phase 1 synthetic/manual work while keeping live integration tasks blocked.

**Rollback:** no external infrastructure or subscription is required merely to finish this phase. Any permitted spike remains isolated and synthetic. Do not sign paid contracts or provision production resources as an implied side effect of writing a plan.
