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

## Task 0.5a — Existing Vercel Pro hosting amendment

Predecessor Task 0.5 PR #6 verified merged at `20cc678417d437fbb8a5813a1ec330e678574ebb`. Its final head `ae76e021f4f8d670c01b803ba194199e44d5ed50` had successful Foundation checks (run 39877468984). This supersedes the historical pending-merge entry above.

The founder set £0 additional monthly production hosting spend, then confirmed Vercel Pro is already paid for. Use that existing subscription's included allocation and a free database as the deployment target. This supersedes the earlier undecided production budget; no new subscription, upgrade, overage or deployment is authorised. Actual account allocation and billing controls are unverified. No team billing settings or other projects changed.

Branch: build/0.5a-existing-vercel-pro. Documentation-only amendment: preserve Next.js/NestJS and local worker processes; hosted jobs need bounded, authenticated execution with durable recovery instead of a permanent polling loop. Task 1.1 has not started. Acceptance: aligned cost/architecture/launch records, primary-source verification, formatting/link/diff/self-review before PR, successful current CI and verified merge. No new runtime tests are justified by a prose-only change; existing full CI remains required.

Founder deployment instruction: everything remains local until the MVP is complete and explicit deployment approval is given. No previews/staging/production, deployment hooks or hosted app/database provisioning before that gate. GitHub PRs and synthetic CI continue under existing authorisation. This supersedes any implication that intermediate build steps may deploy.

Task 0.5a PR: https://github.com/FSS-Ltd/the-joint-app/pull/7. Locally reviewed revision: `788b5ed4dd00cb6a2e9d5f72ec29f8da9cd88980`. Before PR creation, formatting, diff, relative links, budget/local-only assertions and primary-source/self-review passed. No code changes; runtime suites were not repeated locally. Full current-revision Foundation checks, final head/test-merge revision and actual merge evidence will be recorded on the linked PR. State: PR open; no Task 1.1 work started.

## Task 1.1 — Local vertical slice

Predecessor Task 0.5a PR #7 verified merged at `2eb7c6a7b5888cf6088bf432b45c5af4d08a0398`. Final head `0d8ecab0a36fe59266bbabbc08a59854e80ee50f` and test-merge `440bda5a744b948c64c4bdbc8867ca43f538865b` passed Foundation checks, run 39878441329. This supersedes Task 0.5a's historical pending state.

Branch: build/1.1-local-vertical-slice. Plan and interface rulings: docs/decisions/task-1.1-plan.md. Added Prisma migration/client foundation, two idempotently seeded synthetic households, Job/Outbox storage and bounded local runner, plus a signed-identity bootstrap read through Next.js/NestJS/PostgreSQL. Sessions and household membership come from the registry, not client metadata. A record-preserving rename adopts the canonical SessionRegistry name. No financial data tables, login/MFA/invitations, real CSV handlers, cloud resources or deployments are claimed.

Local development remains local-only through MVP completion and explicit deployment approval. The independent worker has no production handlers until Task 1.4; unknown work remains queued. Handler transactions contain only local database writes/outbox, with bounded leases and stale-attempt fencing; external effects require later idempotent outbox consumers. Household revision is the optimistic version field; synthetic tests exercise atomic revision updates rather than implementing fake CSV parsing.

State: implementing and verifying; no PR yet. Formatting/lint/build/types, 5 unit tests, 15 integration tests and 3 browser tests passed during development. Migration configuration and additional recovery checks are undergoing final verification. No Task 1.2 work started. Final local verification/review and current PR CI/merge evidence must pass before this step is complete.

Final local checks so far: frozen install, schema validation, migration deployment, seed twice, formatting, lint, all package/test types, builds, 5 unit / 16 integration / 3 browser tests passed. PostgreSQL stop/restart gave readiness 200 → 503 → 200 with live 200. Combined development startup passed after correcting the verification script to wait for API readiness. Independent review and a fresh-checkout check remain pending before PR creation.

Independent review identified cleanup blocking unrelated claims, an unbounded Prisma callback and mismatched per-job lease/transaction budgets. Each was reproduced and fixed: scoped SKIP LOCKED cleanup, explicit callback deadlines/late-write fencing, aligned five-second limits and post-claim admission checks. Follow-up review found no remaining blocker under the documented DB-only handler contract. The runner budget excludes bounded database acquisition/cleanup overhead; future hosted adapters must reserve that margin. A clean source archive passed frozen installation/build/type checks without private files or generated artifacts.

Fresh disposable local database verification passed all three migrations, seed twice, 19 integration tests and 3 browser tests, then removed only the newly created test database. No existing development data was reset. Additional safe-upstream-failure and unconfigured-auth assertions are included in the final regression run.

Pre-PR final verification passed: formatting, lint, package and test types, builds, 5 unit tests, 19 integration tests and 4 browser tests. Exact installed dependency versions/licences and public-file exclusions inspected; original plan, private inventory, design references and local environment remain untracked. All three independent-review findings resolved and re-reviewed. No production resources or deployment. PR/CI/merge remain pending.

Task 1.1 PR: https://github.com/FSS-Ltd/the-joint-app/pull/8. Locally verified/reviewed implementation revision: `e4ab24ad8cb2f33589b38d678b3e172103a069ea`. All local checks above passed before raising the PR. State: PR open, full required Foundation checks running; no merge yet. The linked PR records final current head, test-merge/check results and host merge evidence. No Task 1.2 work starts until this gate passes.

## Task 1.2 — Local identity and two-adult membership

Predecessor Task 1.1 PR #8 verified merged at `99cdd9fecf528aee9d1cb92e631565fce7370f37`. Final head `09728cfda77f0d8531421d08d26653a8345edb17`, test-merge `5dcab9404cbe6dbd0da0ba9e0ee23ff8ff0a706d`, Foundation checks SUCCESS, run 39880291389. This supersedes Task 1.1's historical pending-merge state.

Branch: build/1.2-local-identity-membership. State: implementation and final verification; no PR yet. Maintained local Supabase Auth provides individual verified email/password, recovery and TOTP. Provider credentials stay encrypted server-side; opaque HttpOnly web sessions use CSRF/origin protection, locked refresh and immediate registry revocation. Household creation/invitations enforce verified-email matching, seven-day hashed tokens, one active household and two adult slots. The mobile-first identity/onboarding UI uses real local endpoints; finance and account grants remain Task 1.3 and later.

Local evidence so far: strict types/builds/lint, unit/BFF tests, actual Auth/provider/HTTP integration and browser identity flow passed during development. Fresh Auth database/vendor migration startup passed in separately named disposable containers; only those test containers/volume were removed. A full final run, clean source/fresh app database verification and independent whole-step review are in progress. Current-revision GitHub CI and merge remain unverified; no Task 1.3 work started.

Review found and fixed refresh rollback losing rotated credentials, stale-cookie global revocation of newer sessions, and transient JWKS outages being treated as invalid identities. Regression tests cover each. Provider enrollment replaces abandoned unverified TOTP factors and preserves an existing verified authenticator. Logout records provider failures after local access is revoked; no claim of atomic commits across Auth and app databases is made.

Everything app/data remains local until MVP completion and explicit deployment approval. No hosted Auth/database, preview, deployment hook, paid service, external invitation email or billing change. GitHub source and synthetic CI remain authorised. Next permissible action: finish verification/review, raise this step's PR, require current green CI and verify authorised merge before any subsequent build step.

Final pre-PR local gate passed: formatting, lint, all package/test types and builds, 28 unit/BFF/fixture tests, 37 real database/Auth/subprocess integration tests and 5 browser tests. Actual two-tab refresh returns 200 in both tabs with a stable opaque cookie and rotated encrypted provider credentials; logout clears another mounted tab. Recovery with an enrolled authenticator cannot change the password before MFA proof. Combined `pnpm dev` and independent configured API startup/shutdown passed. A clean source archive passed frozen installation/build/types; a new disposable app database passed all four migrations, seed twice and integration tests; fresh Auth vendor migrations passed separately. Disposable verification database/containers were removed without touching development data.

Fresh whole-step review found one inbox-port fixture defect, reproduced and fixed with two unit tests. Earlier session findings and the final SDK backoff budget defect were reproduced and fixed; no deferred review findings remain. Public-source exclusions/private-key and diff checks passed. Only current-revision GitHub CI/verified merge remain before this step is complete. No Task 1.3 implementation has begun.

Task 1.2 PR: https://github.com/FSS-Ltd/the-joint-app/pull/9. Locally verified/reviewed implementation revision: `7f0d4dd575fe16e928a92734823c02727ae0ea9d`. Exact committed clean-archive frozen installation/build/types passed before raising the PR. State: PR open; required Foundation checks must succeed on the final head and test-merge revision before authorised merge. Final checked revisions, CI run and actual merge commit are recorded in the linked PR verification/merge comments. No Task 1.3 work starts before this gate passes.

## Task 1.3 — Private accounts, grants and scoped storage

Predecessor Task 1.2 PR #9 verified merged at `7741aaf7c0ef8c19f70ff2434901b1a3db7dfc8a`. Final head `59e89111e4ed78c568df2ad61a2a9e499c62c524`, test-merge `6b57e8b3e32c071fd772ff5c2d9544fec94b9c77`, Foundation checks SUCCESS, run 39885694072. This supersedes Task 1.2's historical pending state.

Branch: build/1.3-private-accounts-and-grants. State: implementing and locally verifying; no PR yet. Plan: docs/decisions/task-1.3-plan.md. Added private manual accounts, dated GBP values and explicit owner-controlled viewing grants, with transaction-local scope and a real restricted PostgreSQL runtime login. MFA gates creation and recent TOTP proof gates wider sharing. Mobile-first accounts reuse the existing warm, minimal family design direction.

Everything remains local until the MVP is complete and the founder explicitly approves deployment. No hosted preview, staging, production, deployment hooks, cloud database or paid service changes. GitHub source and synthetic CI remain authorised. No CSV/transaction/holding implementation, child profile or direct provider integration is included.

Local build, lint and 53 unit tests passed during implementation. Actual database/Auth/browser verification, fresh setup, final self-review and independent review are still in progress. No completion or current CI/merge claim is made. No Task 1.4 work starts before this step's PR, current successful checks and verified authorised merge.

Fresh disposable local PostgreSQL verification passed all nine additive migrations, restricted runtime setup, seed twice and all 48 integration tests. Existing development data was not reset. Independent review found a helper that distinguished hidden partner-account UUIDs from unknown UUIDs; a real-role regression reproduced the disclosure, then the additive creator-bound helper fix passed all 10 isolation tests. Runtime parent deletion/key updates are denied to prevent referential-integrity cascades bypassing immutable finance rows. Synthetic cleanup uses maintenance credentials instead.

Final pre-PR local evidence: all package/test types, formatting, lint and builds passed; 53 unit tests, 48 real local database/Auth/subprocess integration tests and 6 actual browser tests passed. Combined `pnpm dev` gave web 200, API readiness 200, configured unauthenticated identity 401 and worker database-ready, then stopped cleanly. Accounts list/detail were inspected at 390/1280px; 320px overflow, keyboard, 200% zoom and reduced motion passed. Fresh independent whole-step review found no remaining blockers or deferred minors after the reproduced helper fix. Public source/ignored private files and staged diff checks passed. Exact committed clean-source frozen installation/build/type verification follows before PR creation.

Task 1.3 PR: https://github.com/FSS-Ltd/the-joint-app/pull/10. Locally verified and independently reviewed implementation revision: `473247b8a3cb7a4728988e245ddd9475cfe35961`. Exact committed clean-source frozen installation/build/types passed under the pinned Node/pnpm before raising the PR. State: PR open; full required Foundation checks must succeed on the final head and test-merge revision before authorised merge. Final checked revisions, check results and actual merge evidence will be recorded in the linked PR comments. No Task 1.4 work starts before that gate passes. No deployments performed or authorised.

## Task 1.4 — CSV and manual transactions

Predecessor Task 1.3 PR #10 verified MERGED into main at `64c45dbcf7665b13c0d46cc09b5841e061da5335`; final head `e0a7d91f9933b97ff9fcd433217169c159355359`, checked test-merge `80523b3cd828a708399b6446363ceca8b1687598`, Foundation checks SUCCESS run 39889155688. This supersedes the historical pending state above.

Branch: build/1.4-csv-manual-transactions. State: implementing and verifying; no PR yet. Decision record: docs/decisions/task-1.4-plan.md. Added bounded explicit-mapping CSV previews, durable rejects and overlap choices, staged worker publication, original encryption/expiry, rollback/restore, exact manual transactions and immutable corrections, owner classifications and author-private notes. Existing mobile-first styling extends to activity and import screens.

Application execution and data remain local until the entire MVP is complete and the founder explicitly approves deployment. No hosted preview, staging, production, deployment hook, cloud database or paid change is authorised. GitHub source and synthetic CI remain authorised. No Task 1.5 work starts before this step passes current CI and verified authorised merge.

Intermediate verification: 90 unit/BFF/parser/setup tests and strict package/test types passed. Real HTTP/Auth/runtime database import journeys passed. The actual 50,000-row capacity run exposed a permission-query timeout after staging 49,500 rows; optimization and a full rerun are required. Browser verification, full integration/regression, fresh setup and independent final review remain in progress. No completion or CI/merge claim.

Final pre-PR local checks passed: formatting, lint, all package/test types and builds, 93 unit/BFF/parser/setup tests, 64 real database/Auth/worker integration tests and 7 actual browser tests. Actual 50,000-row imports completed across 100 fenced chunks under unchanged five-second job/statement limits; runtime readers saw zero rows during staging and 50,000 only after publication. All 19 migrations, restricted runtime setup, seed twice and 64 integration tests also passed on a fresh disposable local database, then its verification container was removed.

Independent whole-step review found NUL text and year-zero validation defects. Regression tests reproduced both, then shared Unicode/date validation and durable CSV row rejects passed; re-review found no remaining actionable findings. Valid emoji remains supported. Real browser journeys passed 101-row pagination, explicit Keep/Skip, private notes, correction/undo, protected rollback and same-ID restore; inspected 390/1280px plus 320px overflow, keyboard, 200% zoom and reduced motion. Combined local development startup returned web200/APIready200/configured identity401/worker-ready and stopped its verification process group. Public manifest excludes original plan, personal discovery, design references and local secrets. Exact committed clean-source installation/build/type verification remains before PR creation; no next step or deployment.

Task 1.4 PR: https://github.com/FSS-Ltd/the-joint-app/pull/11. Locally verified and independently reviewed implementation revision: `e7220928e17a9b5296a89569102825a108bd7161`. Exact committed clean-source frozen installation/build/types passed before raising the PR. State: PR open; current required Foundation checks and applicable test-merge revision must pass before authorised merge. The linked PR will record final checked revisions, check results and actual merge evidence. No Task 1.5 or deployment started.

CI run 39893630612 on head `9d9d2852bbcf3670877988ebc8e1027e039fa21f` passed install/format/lint/build/migrations/types/unit checks and 63 of 64 integration tests. The full 50,000-row worker test exceeded its unchanged 180-second limit on the hosted runner; browser checks therefore did not run. PR remains unmerged. Profiling found bulk Transaction/TransactionRevision insert policies repeated live-job joins per row (about 83% of a measured 500-row chunk). An additive statement-scoped write-policy fix, unchanged capacity/timeout checks and fresh review/verification are in progress. No Task 1.5 or deployment.

Capacity repair verified: additive migrations 410–412 evaluate trusted live committing-job/row sets once per statement, reuse ledger RLS for revision reads and reject staging outside COMMITTING. A fresh independent review approved the state/tenant/actor/source guards and specific real-role rejection tests. Measured first/last 500-row chunks were about 226/239 ms; full 50,000-row commit was 21.035 seconds, with no fixture reduction or timeout increase.

Fresh regression also exposed a parallel shutdown probe inheriting IMPORT_DATA_KEY and claiming import fixtures. That probe now excludes the key; concurrent worker/shutdown tests pass together. Timed-out capacity tests settle their bounded in-flight work before cleanup. Final current checks passed: 93 unit tests, 66 integration tests, 7 browser tests, formatting/lint/types/builds. All 22 migrations, restricted runtime setup, seed twice and the complete 66-test integration suite passed on a new disposable PostgreSQL database (69.79 seconds), then its container and generated credentials were removed. Additional real HTTP tests prove NUL/year-zero rows become durable rejects and invalid manual input gets safe400. PR #11 remains unmerged pending fresh current-revision CI; no next step or deployment.
