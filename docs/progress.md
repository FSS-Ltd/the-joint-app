# Delivery progress

## B0 — Repository bootstrap

State: PR open; awaiting current-revision CI and authorised merge. Base: main. Branch: build/b0-repository-foundation.

Acceptance: runnable web/API/worker, bounded database readiness, safe configuration, public sanitised plans, local checks and current-revision CI.

PR: https://github.com/FSS-Ltd/the-joint-app/pull/1. Implementation revision: 95c9cfe. Initial CI run: https://github.com/FSS-Ltd/the-joint-app/actions/runs/39861604232 (pending when this record was committed). Latest checked head/test-merge revisions and final results are recorded in the linked PR checks and verification comment. Merge evidence: none; PR remains unmerged. No merge is authorised by this bootstrap request. No next build step may start before B0 is confirmed merged.

Phase 0 and Task 1.1: not complete. Provider permissions, private founder inventory and production gates: unresolved.

### Local evidence

- Frozen install, formatting, lint, strict type checks, unit tests (4), production builds, integration tests (4), browser smoke tests (2): passed.
- Real PostgreSQL stop/restart: the same API/pool returned readiness 200 → 503 → 200; liveness stayed 200. API SIGTERM exited cleanly.
- Worker SIGTERM and invalid API/worker environment failures are covered by subprocess integration tests.
- Docker port 5432 was occupied by an existing service. Local ignored .env uses port 15432; committed default remains 5432 with an override.
- Fresh review identified missing hardware sanitisation and lifecycle evidence; both addressed.

- Confirmed `pnpm dev` starts web, API and worker together.
- Main protection verified: strict Foundation checks, required PR, resolved conversations, admin enforcement, no force pushes/deletion. No inherited rules were returned.
- Automatic publication review flagged residual personal-pilot wording. Corrected and re-inspected before approved publication.

- Initial CI passed code/build/database checks, then failed browser installation because ubuntu-latest resolved to unsupported Ubuntu 26.04. Pinned Ubuntu 24.04 for the tested Playwright release; current-revision rerun required.

### GitHub CI evidence

- Checked implementation head: `75d151540825ad102ec0ddcc6010a2417684933f`.
- Checked test-merge revision: `bdfbb7e95e2031534dc3d3960d363dfe8902a4c4`.
- Required check: **Foundation checks — success** (1m12s).
- Run: https://github.com/FSS-Ltd/the-joint-app/actions/runs/39861765639.
- All frozen-install, formatting, lint, build, type, unit, database/subprocess integration and browser steps succeeded on a fresh GitHub runner.
- This evidence-only update triggers CI again; confirm the latest PR revision's check before merging. Final current-revision evidence is also attached to the PR.
- Gate: PR open, implementation CI green, merge not authorised/performed. Next permissible action is review and authorised merge, then verify host merge evidence before any next step.

- Repeated fresh runners stalled downloading browser OS dependencies. CI now uses the official Playwright v1.58.2 Noble image matching the pinned test library; all checks remain mandatory. Container jobs address their synthetic PostgreSQL service by its service hostname.

## Task 0.1 — Inventory and scope discovery

Predecessor verified on GitHub: B0 PR #1 merged 22 October 2026 at `fb79c8a23af3c590857f4d03d92385c1cb367cd9`; Foundation checks succeeded for final head `fca0bd88f965ddde1eecba9b33320e7a0ea22b36`. This supersedes the historical B0 “unmerged” entries above.

State: in progress. Branch: build/p0-baseline-and-design-direction. Actual provider/product inputs are recorded in ignored private discovery notes; ownership, currencies, exact investment product, history/import route and permissions remain unverified. Default sharing is NONE.

Scope and mobile-first reference synthesis are recorded in docs/decisions/scope-baseline.md and design-direction.md. All eight supplied images were inspected. Original references stay local; no third-party artwork is published.

Acceptance: requested products have explicit owner/data/import requirements, scope is agreed, public docs reveal no household institutions, mobile-first direction is documented, documentation checks pass, PR current CI passes and merge is verified. Task 0.1 is incomplete while discovery evidence is missing. Phase 0 is not complete.

Next permissible action: obtain remaining private inventory evidence and resolve this step's review. Do not implement Task 0.2 or Phase 1 before this step's PR/CI/merge gate passes.

Task 0.1 PR: https://github.com/FSS-Ltd/the-joint-app/pull/2 (draft). Implementation revision: `81624d8d547002af18b5ecb051805f1d6ed8cdfa`. Local formatting, public-disclosure/link review, diff checks and text contrast checks passed (minimum measured text contrast 6.15:1). Runtime suites were not rerun locally for documentation-only changes; full existing CI remains required. Latest current-revision CI is linked from the PR. Merge evidence: none. Missing inventory evidence remains the blocker; no later step started.

### Task 0.1 scope clarification — 23 October 2026

New founder answers establish reported adult ownership/operator categories and investment currency intent. Household specifics remain local. Child profiles are explicitly deferred post-MVP; canonical product intent and affected phase entry notes now reflect this. Candidate manual/export routes exist privately; all live source permissions remain unverified.

Initial discovery is now recorded. Previous requirements for verified registered ownership, exact wrapper and actual exports at Task 0.1 were too strict for this stage: these are source-activation/procurement checks, not permission to invent facts or block recording a useful initial inventory. No provider-specific work has begun. Up to 12 months of history remains a proposed default, not a confirmed answer.

State: current-step revision under verification, ready for review after current CI. PR #2 remains the delivery unit. No merge performed. Next step remains Task 0.2 only after PR #2 is approved for merge, all current checks pass and GitHub confirms merge. Phase 0 and the full project remain incomplete.

## Task 0.2 — Bank procurement and AIS arrangement

Predecessor verified: Task 0.1 PR #2 merged at `7528d5458a3b0da05c448c76c48c8ae63ef5ebef` on 22 October 2026 UTC (23 October in Europe/London). Its final head `2a4407959ba06fc47f685109a114898a1e838266` and test-merge `47aad80bf5541c839e6e2773c2005ac520de1667` had successful Foundation checks (run 39874571082). This supersedes the prior unmerged Task 0.1 entries.

Merge authorization: founder explicitly authorises merging PRs once required checks are green; always verify/self-review work before raising each PR and respect required reviews/protections. This does not authorise supplier messages, spend or deployment.

Branch: build/0.2-bank-provider-feasibility. Current state: research and unsent enquiry brief prepared; B1/B2/B3 supplier evidence missing. Comparison, gate register and vendor brief are public and contain no household institution-to-owner mappings. No live account access, provider contact, contract or spend performed.

Acceptance remains the actual approved production path, permitted scope, exact coverage and quoted units. The public research does not meet that supplier-dependent criterion. A draft PR will preserve the reviewed work; no later step may start until the current step meets its evidence/CI/merge gate. Next action: founder supplies existing provider evidence or authorises the concrete enquiry through an agreed channel.
