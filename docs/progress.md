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

Task 0.2 draft PR: https://github.com/FSS-Ltd/the-joint-app/pull/3. Research revision: `ccdc742d098b8e5a8049b90b83f51860dc4ac629`. Before PR creation, formatting, diff checks, relative links, public disclosure and source/evidence self-review passed. Full current CI evidence is recorded on the linked PR. Merge evidence: none; the supplier-dependent task remains incomplete regardless of code CI. No later step started.

### Task 0.2 revised disposition — 23 October 2026

Founder explicitly requested CSV/manual records now and direct bank connections post-MVP. This supersedes the previous supplier-evidence blocker for current MVP development. B1–B3 remain missing future live-bank gates, not approved or waived. No live broker connector is included in the CSV-first build; provider-specific work retains its own approval gate.

Task 0.2's revised acceptance is the documented bank-procurement deferral, retained evidence/brief and aligned canonical release scope. PR #3 will be made ready and merged only after local review and successful current-revision CI. No supplier enquiry, contract, spend or deployment performed. No next step started before verified merge.

## Task 0.3 — CSV investment and API permission boundary

Predecessor Task 0.2 PR #3 verified merged at `25221791453d5059536fe5167dde72f3670c2394` on 23 October 2026. Final head `0f1eb8d6aa2ed1577a92a7c59fd0e47adeba0ed8`, test-merge `921057975e13e401ce71fbd59defa01fb4e16644`, Foundation checks SUCCESS (run 39875705715). This supersedes historical Task 0.2 blocked/draft entries; the approved disposition defers direct bank integration post-MVP without approving supplier gates.

Branch: build/0.3-csv-investment-boundary. Current step records generic CSV/manual investment scope and unmet T1/T2 future API gates. Official API terms and export help were inspected; no provider-specific API code, credentials, contact, contract or live data access. Personal account details remain local.

Acceptance: explicit CSV/manual boundary, held API permission/actual account gates, no fabricated holdings/coverage, correct source references and local document review before raising its PR. This is a boundary disposition for CSV-first development, not provider permission or a connected release. Next Task 0.4 begins only after this step's current CI and verified merge.

Task 0.3 PR: https://github.com/FSS-Ltd/the-joint-app/pull/4. Initial checked local revision: `4c80f5243ead6282987695d1bd0c8f0f58b7bd50`. Formatting, diff, links/disclosure, primary-source review and missing-gate assertions passed before raising the PR. Existing full runtime CI is required on the latest revision; final head/test-merge evidence is recorded on the PR. Merge evidence is pending; no Task 0.4 work started.

## Task 0.4 — Architecture, version and model baseline

Predecessor Task 0.3 PR #4 verified merged at `9a5d2b3de3b29d8474a9f4bf41eea3936f78b2e7`. Final head `4dda7a4c1d5ec43ccb60d58ab3248c6bd473e529` and test-merge `e94a4c6a1c7fa446d8844015651faa2126368978` had successful Foundation checks (run 39876114710). This supersedes historical pending-merge Task 0.3 entries.

Branch: build/0.4-architecture-version-baseline. Existing installed direct versions/licences compared against frozen-lockfile install; proposed ORM/auth/native pins checked through registry/official docs. Supabase region, backup and server-only auth boundary researched; no hosted project provisioned. Supabase skill was consulted; project Prisma-only migration history remains authoritative.

Three bounded synthetic-only loopback model requests completed with digest verification and final unload. Short-prompt latency and artifact size are recorded; peak memory, 4K saturation, exact E4B/E2B lineage/comparison, household uptime and per-adult consent remain later gates. No download, real account data or cloud AI used. Task 0.4 acceptance is a truthful executable baseline and explicit measurement/implementation gates, not fabricated production/device approval.

No product code/schema/dependencies or cloud resources changed. Current step will be locally checked and reviewed before its PR. Task 0.5 cannot begin until current CI and verified merge pass.

Task 0.4 PR: https://github.com/FSS-Ltd/the-joint-app/pull/5. Locally checked baseline revision: `0ba8bb75fa8b525075f4dd91f22ed6b4b3ce14c0`. Pre-PR verification passed: frozen install, exact installed version/licence metadata, formatting, lint, 4 unit tests, links/disclosure/diff review, three synthetic model runs and JSON/fact/limit checks. No app code changed; full runtime CI remains required on the final PR head. Final head/test-merge/check evidence is recorded on the PR. Merge pending; no Task 0.5 work started.

## Task 0.5 — CSV-first release gates and cost baseline

Predecessor Task 0.4 PR #5 verified merged at `bf332fa6433220303ca49d62e4c28c0cf38f2200`. Final head `0cd3d08cbe7510883b560b4733a5d00ba50fe2cd`, test-merge `73f193d1dbcd27c32a29cefbba76e42dae0f786d`, Foundation checks SUCCESS (run 39876961008). This supersedes historical Task 0.4 pending-merge entries.

Branch: build/0.5-csv-release-gates. Release scope maps R01–R16 and the revised phase order; launch gates have explicit owners/evidence. Cost model separates known vendor headlines, hypothetical sensitivity inputs, missing actual costs and spend authority. New recurring-spend authority remains £0 until an explicit concrete purchase/deployment approval; production planning budget is undecided. No paid services provisioned or quotes invented.

Current baseline acceptance: accurate CSV-first/manual versus future-source/child scope, no false production/quality/commercial claims, explicit gates/owners, checked cost arithmetic and repository links, local formatting/self-review before PR. No product code changed. Phase 1 Task 1.1 starts only after current CI and verified merge of this final Phase 0 baseline unit. Real-data/production/public gates remain open; baseline handoff does not complete the product.

Task 0.5 PR: https://github.com/FSS-Ltd/the-joint-app/pull/6. Locally verified baseline revision: `752cbb72b9d3973be0f473dfc0020ccf03d6f98c`. Before raising the PR, formatting, diff checks, links/disclosure, R01–R16 mapping, independent cost arithmetic and scope/evidence self-review passed. No code/schema/dependency changes; full existing runtime CI remains required on the latest head. Final head/test-merge/merge evidence is recorded on the PR. No Phase 1 implementation begins before this step is confirmed merged.
