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

## Task 1.5 — Spending, budgets and monthly review

Predecessor Task 1.4 PR #11 verified MERGED into main at `d75ff77ea17824961a748c7a40774bfb24a09c7e`. Final head `71de31add6ad2c58ce4a4d22075eb52b7e1ec875`, actual tested merge `3056888509a4e84e706cdeaadd37224496736fff`, required Foundation checks SUCCESS run 39895150993. This supersedes historical Task 1.4 pending state. Evidence: https://github.com/FSS-Ltd/the-joint-app/pull/11#issuecomment-6356733482 and https://github.com/FSS-Ltd/the-joint-app/pull/11#issuecomment-6356741794.

Branch: build/1.5-spending-budgets-review. State: implementing and verifying; no PR yet. Binding design: docs/decisions/task-1.5-plan.md. Scope includes explicit financial classifications, exact replacing splits, owner-confirmed transfers, permission-scoped monthly reports, arbitrary selected-account shared budgets, owner-attested closed-month coverage and safe static-only offline fallback. No additional dependency is required; existing Zod, Prisma, PostgreSQL, exact Money and browser test tooling cover the implementation.

Intermediate evidence: pure cash-flow goldens pass for transfers, credit-card settlement and later-month refunds; real restricted-role tests cover shared planning, owner-only source/coverage writes, tenant isolation and concurrent transfer claims. A classified 50,000-row query exposed a timeout under the unchanged five-second SQL limit. Measured query/policy repairs and complete capacity/regression verification remain in progress. Local HTTP and real browser journeys, final source review, independent review, current CI and verified merge are still required. No Task 1.6 implementation has started.

Application execution and data remain local until the entire MVP is complete and the founder explicitly approves deployment. No preview, staging, production, deployment hook, hosted database or paid service changes. GitHub source and synthetic CI remain authorised.

Final local implementation checks passed: formatting, lint, all package/test types and builds, 119 unit/BFF/domain tests, 94 real database/Auth/worker integration tests and 9 actual browser tests. The full integration run completed in 30.06 seconds after measured fixture-plan repair; runtime capacity assertions still cover 50,000 classified rows, exact totals beyond int64 and category compaction under unchanged five-second limits. A deterministic host-clock regression also reproduced and fixed enqueue scheduling authority without changing existing jobs or retry deadlines.

The independent whole-step review's three UI findings were reproduced and fixed, with actual incoming-leg transfer, shared mixed split and revoked-save/focus regressions. Parent inspected 390/1280px screenshots; 320px overflow, 200% zoom, reduced motion, keyboard access, chart tables and static-only CacheStorage passed. Actual `pnpm dev` returned web200/API live200/ready200/configured identity401/worker-ready, then its verification process group stopped cleanly. Public source excludes original plans, personal inventory, design references and local credentials. No review findings are deferred. Exact committed clean-source and fresh-database full-suite verification remain before PR creation; no Task 1.6 or deployment.

Task 1.5 PR: https://github.com/FSS-Ltd/the-joint-app/pull/12. Locally verified/reviewed implementation revision: `2ad9b842cee837a734996e5d9eccab7f3bd649ab`. Exact committed clean-source frozen installation/build/types/style, 119 unit tests and all 94 integration tests passed against a fresh isolated database (79.64 seconds). All 30 migrations, restricted runtime setup and seed twice passed; all 372 committed source files matched the archive after build. Verification container, archives and generated credentials were removed without changing development data.

State: PR open; current required Foundation checks and its actual test-merge revision must succeed before authorised merge. Stable verification record: https://github.com/FSS-Ltd/the-joint-app/pull/12#issuecomment-6357429187. It records the final checked head/test-merge revision, CI results, review/conversation state and host merge evidence as those become available. No Task 1.6 or deployment starts before the delivery gate passes; deployment additionally requires the entire MVP and explicit founder approval.

## Task 1.6 — Entitlements, privacy and local recovery

Predecessor Task 1.5 PR #12 verified MERGED into main at `81bdd0897decc5bca6145e73f8303538a49b0be1`. Final head `9393e3c2b93b2084ae5c8fadb342da2c39f870bb`, actual tested merge `d81328d0db80f56713eb0b90d583a8193a9bd6fb`, Foundation checks SUCCESS run 39900878616. This supersedes the historical pending state above. Evidence: https://github.com/FSS-Ltd/the-joint-app/pull/12#issuecomment-6357429187.

Branch: build/1.6-entitlements-privacy-recovery. State: planning and implementation; no PR yet. Binding plan: docs/decisions/task-1.6-plan.md. Scope: server entitlements, scoped exports, safe leave/deletion and ownership archives, payload-free audit and isolated local restore with deletion-ledger replay. All execution/data remain local until the entire MVP is complete and explicit founder deployment approval is given. No hosted rehearsal, preview, staging, production, deployment hooks or hosted app/database provisioning. GitHub source and synthetic CI remain authorised. No Task 1.6 completion or new verification claim.

Intermediate Task 1.6 evidence: all active package builds and strict package/test types passed; 154 unit/BFF tests passed. Restricted-role entitlement, archive/deletion and export tests passed, including 50,000-row import/report regressions under unchanged limits. Actual local Auth worker deletion and API/worker sentinel-redaction tests passed. The real browser journey covers two adults, import, budget, grant downgrade, authenticated export, leave, archive reauthentication and a purpose-bound deletion receipt. Parent inspected privacy at 390/1280px. These are intermediate results, not full final verification.

Self-review is addressing archive access after joining a new household, fresh-MFA export recovery, focus-driven permission refresh and export epoch privacy for excluded notes/details. The isolated local restore exercise is in progress. Full combined regression, fresh source/database verification and independent review remain before PR creation. No next build step or deployment.

Final local Task 1.6 implementation gate passed: frozen installation, formatting, lint, all package/test types and builds, 160 unit/BFF tests, 128 real database/Auth/worker/restore integration tests and 10 browser tests. The full integration run includes 50,000-row import/report checks and a bulk deletion with 128 unrelated ready export scopes, under unchanged statement limits. Combined development startup returned web200/API live200/ready200/worker-ready; independently configured API and privacy worker both exited cleanly on SIGTERM.

Independent whole-step review and scoped re-reviews have no remaining findings. Regression fixes cover explicit authorised export EOF and aborted partial HTTP bodies, projection-specific export epochs, final-owner joint deletion, fair bounded retry scheduling, and both queued and initially pending export recovery across focus refresh. An older isolation fixture now uses a separate actor for irreversible leave rather than attempting forbidden reactivation. No speculative SQL performance change or timeout increase was added. Parent and delegated visual checks cover mobile/desktop, keyboard, 320px overflow, zoom and reduced motion.

Public manifest and generated-local-secret scans passed. Original plans, personal inventory, design references and local credentials remain ignored. No third-party dependency was added. Exact committed clean-source/fresh-database verification is the remaining local gate before this step's PR. Current GitHub CI and merge are not yet claimed; Task 1.6 remains in progress. No next build step or deployment.

Task 1.6 PR: https://github.com/FSS-Ltd/the-joint-app/pull/13. Locally verified/reviewed implementation revision: `309613cbb013072381ea7b1af2becfa7081c415d`. The exact committed clean-source archive passed offline frozen installation, formatting/lint, all builds/types, 160 unit tests, all 49 migrations, restricted runtime setup, seed twice and all 128 integration tests against a new isolated database (42.33 seconds). All 484 committed source files matched after verification. Disposable database and clean-source copies were removed without changing development data.

State: PR open; latest required Foundation checks and its actual test-merge revision must succeed before authorised merge. The PR verification/merge comment records the final checked head, tested merge, CI run and host merge evidence. Task 1.6 remains unmerged and no next step has started. No deployment; completion of the entire MVP and explicit founder approval are still required.

Task 1.6 CI follow-up: the initial head passed integration but failed Linux 200% zoom; the documentation-only successor hit preview/cascade deadlines under unrelated suite load. Both runs remain unsuccessful delivery evidence. Profiling disproved a speculative trigger regression, so no SQL migration or deadline increase was added. Capacity files now run separately before parallel ordinary integration files. Discovery and JSON execution timestamps verify all 32 files exactly once, four sequential capacity files completed first, and every explicit within-file concurrency scenario and deadline remains intact. A restricted-role purge also removes 50,000 records with full revision/classification/private-note children while preserving 128 unrelated export scopes. These measurements do not establish concurrent production throughput.

The pinned Linux browser reproduced and verified fixes for intrinsic privacy layout at 200% zoom and enabled authentication controls before delayed hydration. Controls and continuation links now wait for client context; the recovery identity/MFA guard remains intact. The import journey waits for visible undo acknowledgement before its next mutation, with numeric-only version diagnostics on failures. No optimistic-concurrency check was weakened. All current local formatting/lint/build/type checks, 160 unit tests, 128 integration tests and all 11 pinned Linux browser tests with two workers passed. Independent scoped reviews report no remaining findings. Parent inspected the actual Linux mobile and zoom screenshots.

Latest exact-source verification and CI/merge evidence are maintained in the stable PR record: https://github.com/FSS-Ltd/the-joint-app/pull/13#issuecomment-6358410175. The current step remains unmerged until that record confirms successful current-head/test-merge CI and host merge. No later build step or deployment has started.

## Task 3A — Wealth and goal contracts and storage

Predecessor Task 1.6 PR #13 verified MERGED at 2026-10-23T06:30:13Z into `main`, merge commit `b14a06297f3323ffad9ab305259a64314e5920e6`. Final checked head `0e8746b5f42bfef6d496f6d9de14dfa2987cc4ae`; actual CI checkout/test-merge `f6677465524ff387f8a1ceb408257bb82a8d0578`. Required Foundation checks SUCCESS, run [39911073723](https://github.com/FSS-Ltd/the-joint-app/actions/runs/39911073723): frozen installation, formatting, lint, builds, all 49 migrations, restricted runtime setup, seed, type checks, 160 unit/BFF tests, 128 integration tests and 11 browser tests. No unresolved review conversations; existing protections and approval policy remain unchanged. This supersedes the historical pending states above. Durable evidence: https://github.com/FSS-Ltd/the-joint-app/pull/13#issuecomment-6358410175.

Branch: `build/3a-wealth-goal-contracts`. State: planning and implementation; no PR yet. [Binding plan](decisions/task-3a-contracts-storage-plan.md). This implements Phase 3 Task A only: strict shared contracts, explicit projection assumptions and additive protected storage. Runtime access to the new tables remains denied until later authorised domain/lifecycle operations exist. No wealth screen, calculator or completed Phase 3 is claimed. The agreed CSV-first execution order skips deferred Phase 2 direct connections and child profiles.

Everything remains local until the entire MVP is done and the founder explicitly approves deployment. No hosted preview, staging, production, deployment hook, cloud database, provisioning or paid changes. GitHub source and synthetic CI remain authorised. No Task B implementation starts before Task 3A has locally verified delivery, successful current CI and host-verified merge.

Task 3A contract subtask is locally implemented and independently reviewed at `09ce101` (initial contract commit `0e139c3`). Focused contract/money tests, package builds/types, test types, ESLint and formatting passed. Review regressions now reject contradictory visible-scope valuations, competing same-account allocations, duplicate/unordered result months and result dates/horizons inconsistent with input. Strict bounded decimals use exact integer comparisons; growth/fee/inflation provenance is explicit. This is not a computed wealth/projection feature. Additive default-denied storage is being implemented next; full combined verification and the Task 3A PR/CI/merge gates remain outstanding.

Task 3A storage subtask is implemented through `7d86e02`: seven new default-denied tables, matching household/account/valuation/scenario references, canonical input/hash preservation and database-stamped atomic source creation. The initial local migration and three additive guards preserve already-applied checksums. Focused real-role storage checks pass 7/7, including post-commit/source mutation rejection, parent-run deletion, forged transaction stamps and ADVANCED scenario/input mismatch. All new tables enable and force RLS; no runtime route or table privilege is added. Goal lifecycle/export/deletion/revocation handling remains a mandatory prerequisite before Task C enables writes.

Parent verification so far: formatting, lint, all builds/types, 173 unit tests and all 11 pinned Linux browser tests passed. The first full integration run passed 132/133 but hit the unchanged five-second deadline on the existing 50,000-row spending grouped query. An isolated synthetic EXPLAIN diagnostic subsequently passed that same test without fixture/deadline changes; no speculative performance patch was added. The fresh-database full suite remains required. Scoped storage re-review approved the fixes. Final independent review and fresh full verification remain pending; Task 3A remains unmerged with no PR yet. No deployment.

Final independent review found one malformed-money validation defect: a run-level BigInt refinement could throw after a nested amount failed validation. Commit `56b9394` adds safe operand parsing and RED-to-GREEN regressions; focused checks pass, scoped final re-review is pending. No further implementation finding is open.

Fresh exact-source setup applied all 53 migrations and seeded twice, but its broad integration run failed under concurrent unrelated host compiler/test load: 107 passed, 14 failed and 14 skipped. This is not passing evidence. Capacity deadlines, fixtures and race assertions remain unchanged. A two-worker local fresh-suite retry is planned to bound host resource use; required CI retains its existing scheduling. Runtime storage remains denied and Task 3A remains unmerged. No next step or deployment.

## Task 3B — Manual wealth valuation and ownership

Predecessor Task 3A PR #14 verified MERGED at 2026-10-23T07:33:44Z into `main`, merge commit `b56905901c21faaf78575f04cd638c2512b637b4`. Checked head `8df0ceaf0918ab19656fff51f52922c2b7d5b641`; actual completed CI checkout/test-merge `cba157a8c5e7baf45de1e0d425410576225333b0`. Required Foundation checks SUCCESS [run 39917014570](https://github.com/FSS-Ltd/the-joint-app/actions/runs/39917014570): frozen installation, formatting/lint, builds/types, all 53 migrations, restricted runtime, seed, 173 unit tests, 135 integration tests and 11 browser tests. Independent task and final reviews approved the regression fixes. Main protections and approval requirements were unchanged, with no blocking reviews or unresolved conversations. This supersedes historical Task 3A pending states. Durable verification/merge record: https://github.com/FSS-Ltd/the-joint-app/pull/14#issuecomment-6359715866.

Task 3A local limitation remains explicit: complete local integration did not pass under concurrent host compiler/test load, including a bounded two-worker retry. Those failed runs are not acceptance evidence. Targeted local checks and browser regressions passed; complete current-source regression acceptance comes from the isolated required CI run above. All 499 clean-checkout committed files remained unchanged; no test fixture, deadline or explicit race assertion was relaxed. Owned verification containers, restore containers/volumes, source copies and the completed plan workspace were removed; development services/data and private journals remain intact. No local throughput guarantee is claimed.

Branch: `build/3b-manual-wealth-valuation`. State: implementing; no PR yet. Scope is the Phase 3 Task B pure manual valuation and permission-scoped wealth API. Goal writes, allocation locking, calculator, UI and actual provider/FX/child-profile features remain later work. Planning must preserve original valuations while handling non-adult earmarks conservatively and ensure visible-source versions cannot reveal hidden household activity. No new third-party dependency is planned.

Everything remains local. No preview, staging, production, deployment hooks, hosted databases or paid changes until the entire MVP is complete and the founder explicitly approves deployment. No next build step begins before this step has locally checked delivery, successful current CI and host-verified merge.

Owner-attested adult portions now preserve original manual evidence, historical unknowns, replay compatibility, read-only TOTALS access, archived ownership and CSV details. Additive migration 20261023080000 passed a disposable 54-migration populated-upgrade check with an exact beyond-safe-integer original amount retained and adult ownership null. Pure valuation golden tests passed; bounded RLS reads and deterministic source/revocation/archive/logout/exit race checks passed. Full current-branch checks and independent review remain pending. No new dependency or deployment.

Current local verification: formatting, lint, type checks, all package builds, 192 unit tests and 11 browser tests passed. The first complete integration run passed 148/150: one regression in hidden-account denial was fixed by additive migration 20261023080100, and an existing export request denial passed on isolated rerun. Isolation/attestation/export rerun passed 31/31. All 55 migrations and a populated pre-step upgrade passed after the correction. A complete integration retry is running; these partial results do not establish full acceptance. The local browser server mounted dependencies only, with no private repository files, and its owned container was removed.

Independent whole-branch senior review of `d4667c8` found no Critical, Important or Minor code issues. A clean committed-source checkout passed frozen offline installation, formatting, lint, all builds, type checks and 192 unit tests; all 512 tracked files remained unchanged. Local integration retry passed 149/150: unchanged `tests/spending-reports.integration.ts:295` exceeded the existing five-second PostgreSQL statement timeout on its 50,000-row RLS join. No fixture, deadline, policy or CI command was weakened. This is not a passing full-local result. Current-revision isolated CI must supply complete regression acceptance before merge; draft delivery is permitted while that blocker is checked.

Review scope rulings: provider/FX reconciliation and child profiles remain post-MVP; goal writers/calculation remain later gated steps; the attestation control remains with the later wealth screen (current omitted ownership stays unknown); hosted compatibility and production performance require later authorized release validation. These boundaries avoid unsupported accuracy, ownership and operational claims, while leaving those capabilities unavailable now. Registration follows the existing identity-controller factory, and SQL directly bounds each account's snapshot selection. No deferred minor findings.

Task 3B draft PR: https://github.com/FSS-Ltd/the-joint-app/pull/15 against `main`. Implementation reviewed at `d4667c8a6fb4d21e075b09ac62e1afbd8c41277c`; checked delivery revision `d63b655` adds verification prose only. Current required Foundation checks are pending; local full integration remains 149/150. Remain on Task 3B until current CI and host-verified merge.

## Task 3C.1 — Pure funding rules

Predecessor Task 3B PR #15 verified MERGED at 2026-10-23T08:35:25Z, merge `db8029f88446dec953f64f4979f68eb397fa1c8e`. Checked PR head `8683170a964340b6e9f8bbb91d817414bf3ec0d8` and actual CI checkout/test-merge `cd547ab8b1e15ae5bfe3ed5addcc42e7045a04fa`; required Foundation checks SUCCESS [run 39924874648](https://github.com/FSS-Ltd/the-joint-app/actions/runs/39924874648): frozen install/style/lint/builds, all 55 migrations, restricted runtime/seed, types, 192 unit, 150 integration and 11 browser tests. No blocking host reviews/conversations; inherited protections unchanged. Durable merge evidence: https://github.com/FSS-Ltd/the-joint-app/pull/15#issuecomment-6360904058. This supersedes earlier pending Task 3B states. Local full integration remains 149/150 due the unchanged 50,000-row spending RLS join's five-second timeout; CI passed that assertion. Independent review found no code issues. Completed plan scratch and owned temporary verification resources were removed; development data remains intact.

Task C is divided into independently reviewable delivery units: pure funding rules first, then authorized goal lifecycle/persistence and atomic allocation/contribution writers. Task 3C.1 does not complete Task C. It adds no goal writer, route, screen, permission model or deployment. Branch `build/3c1-pure-funding-rules`; state planning. Source ownership, settled eligibility and reserves must be explicit inputs rather than inferred from read grants or net worth. Existing goal/projection tables remain runtime denied.

Task 3C.1 allocation rules: 11 focused tests observed RED then GREEN. Domain build, complete test-source typecheck and scoped lint passed. Tests cover competing claims, replacement without double counting, safe reductions/releases during a fall, explicit settled/reserve evidence, unknowns, source freshness, ineligible assets, historic fraction bases and exact HALF_UP/int64 arithmetic. The existing canonical date schema is now exported for reuse rather than duplicated. No runtime writer is enabled; full step verification and review remain pending.

Task 3C.1 shared contribution rules: seven additional tests observed RED then GREEN; combined pure funding tests pass 18/18. Monthly priorities/UUID tie-breaking, conserved requests/shortfalls, exact large totals and 600 months are verified. Domain build, complete test-source typecheck and scoped lint pass. No allocation or contribution writer is activated. Full branch verification and independent review remain pending.

Task 3C.1 final local evidence: exact committed source `bf0cf1e` installed with the frozen offline lockfile and passed formatting, lint, all package builds, full type checks and all 211 unit tests in a clean checkout; all 520 tracked files were unchanged. Full local integration passed 150/150, including the unchanged spending capacity assertion. All 11 local browser regressions passed using the dependency-only pinned browser image. No database migration or dependency change. Independent whole-branch review of `051d1ec` found no code issues; a later parent self-review sparse-vector regression failed then passed and was committed as `bf0cf1e`, followed by the complete clean-source unit/static verification above. Owned temporary checkout/browser resources were removed; development data preserved.

Review scope rulings: pure rules do not prove transactional concurrency or completeness of claim selection; later scoped writers must authorize every source, load all active intentions, persist immutable settled/reserve evidence, lock accounts and align dated monthly plans. External routes must strictly validate full DTOs; typed internal helpers only enforce their documented money/date/identity/rate boundaries. Generic source currencies are accepted at input solely for safe rejection unless GBP. Goal lifecycle/privacy, UI, provider/FX/child capabilities and deployment remain unavailable. No deferred minor findings. Current step is locally verified and ready for its own PR; Task C is not complete.

Task 3C.1 PR: https://github.com/FSS-Ltd/the-joint-app/pull/16 against `main`. Reviewed implementation `051d1eca666dfd7235dab17796d6b2eff9c5363a`, final sparse fix/clean-source check `bf0cf1e`, delivery revision `d291983` adds verification prose only. Current required Foundation checks pending; no next build step or deployment before verified merge.

## Task 3C.2 — Shared goal lifecycle

Predecessor Task 3C.1 PR #16 verified MERGED at 2026-10-23T09:08:26Z, merge `b8a295fd096fb61f892ed88313559b59f61b2479`. Checked head `812951a9db8b191cb9cee57561e558174b508706` and actual CI checkout `be9e0f2a9a50a791053b76b59ba7e3b5007cead3`; required Foundation checks SUCCESS [run 39928846881](https://github.com/FSS-Ltd/the-joint-app/actions/runs/39928846881): frozen install/style/lint/builds, 55 migrations/runtime/seed, types, 211 unit, 150 integration and 11 browser tests. No blocking reviews/conversations; inherited protections unchanged. Durable merge evidence: https://github.com/FSS-Ltd/the-joint-app/pull/16#issuecomment-6361464679. This supersedes historical pending Task 3C.1 states.

Branch `build/3c2-shared-goal-lifecycle`; implementing metadata lifecycle, immutable history, frozen participant archives and free fresh-MFA JSON export. Founder confirmed shared household goals with separately controlled funding. Current-adult participants are snapshotted; new invitations grant no old goal access. New runtime table privileges remain denied; narrow scoped functions perform metadata operations only. Two additive migrations preserve legacy default denial and fix a SQL JSON-null boundary through a forward migration. No source funding, contribution, scenario or projection writer is enabled. No deployment or paid change.

Focused contracts, SQL lifecycle/storage and real HTTP checks observed missing-feature failures before passing. Exact money, competing optimistic writes, immutable history, legacy/cross-household denial, exit cutoffs, replacement-member denial, deletion retention, fresh-MFA export, no-store and creation replay are covered. Full current-source checks and independent whole-branch review remain pending. Task C remains incomplete.

Task 3C.2 independent review of `3e10afd7e246088907afbdc5e0336a73569a2679` found no Critical or Minor issues and two Important findings. Both were accepted: a frozen participant did not justify retaining a deleted adult's later private revisions, and actual purge/restore paths lacked goal fixtures. One fix pass observed the deletion regression fail with versions [1,2] instead of [1], then pass; restore-output regression failed before explicit goal fixtures/proofs and then passed. Actual deletion request/lease/purge, repeated purge, immutable-history guards, frozen reads, independently shared retention, exclusive removal and original timestamp preservation now pass. New restore goal fixtures run only in owned disposable clones and pass repeated journal replay. A populated intermediate-upgrade regression failed before the repair migration and then passed, proving older unjustified metadata is removed without rewriting surviving history. All 59 fresh migrations and the unclassified legacy upgrade pass. Current focused lifecycle/purge/restore result: 10/10. Complete final-source verification remains pending.

Review rulings and costs: keep the established primary-checkout/Native workflow (isolation relies on the branch and clean-source verification); snapshot current participants without widening (new partners cannot see old goals); use free on-demand JSON pages (clients collect successive authorized pages); preserve applied migrations through forward fixes (four additive migrations in this step); use canonical POST creation replay and encrypted scoped cursors (clients must follow those interfaces). Dormant funding/contribution/projection/source recomputation and maintenance-seeded funding-reference deletion remain deferred (no money commitments or calculations; future activation must add their privacy lifecycle). Participant widening, unarchive, transfer/reactivation, children/non-GBP and goal screens remain unavailable. Exports are successive current-authorized pages, not a global snapshot; provenance is metadata/version/time without per-editor reconstruction. Production capacity/hosted behavior/deployment remain unverified; no throughput or release claim. No deferred minor findings.

Initial full local integration passed 158/159: the unchanged 50,000-row spending RLS join exceeded its existing five-second statement timeout; the unchanged test passed on isolated retry. No fixture, deadline, policy or CI command was weakened. The initial clean committed checkout passed frozen offline install, formatting, lint, all builds/types and 216 unit tests, with 534 tracked files unchanged; all 11 browser regressions passed. These precede the privacy fix and do not replace final-source checks. The first new deletion test's cleanup hit an audit FK; cleanup was corrected, and its exactly verified two synthetic orphan identities/audit row were removed. Development services, user data and private journals remain preserved.

Parent self-review also reproduced valid UUID-case pagination failure (uppercase initial goal path followed by the canonical returned ID). The real history/export test failed, cursor bindings were normalized to the canonical goal UUID, and the test passed. This remains within the same review fix pass. The privacy-fixed clean checkout passed 216 unit tests and all static/build/type checks with 539 files unchanged; final canonical-fix delivery checks follow.

Founder requirement intake 2026-10-23: extend category budgets with spending caps, a visible remaining allowance, red at zero, gentle accessible overspend motion, qualified savings-plan impact and month-end encouragement towards a user-selected savings/investment goal. Recorded in `docs/decisions/category-caps-and-savings-plan.md`, R06 and Phase 3 Task E, with a cross-reference from the completed Task 1.5 foundations. This is a plan update only: no feature, automatic financial action, gate completion or deployment is claimed. Existing budget/source permissions and explicit funding control remain mandatory.

Task 3C.2 final local verification at `fbbdb79a63909d06ab8aabe579284aa7dea365d6`: a fresh exact committed checkout passed frozen offline installation, formatting, lint, every package build, full type checks and 216 unit tests. A fresh label-verified loopback PostgreSQL container applied all 59 migrations, configured the restricted runtime and seeded synthetic data. The complete integration suite passed 160/160 with two workers and unchanged fixtures/deadlines, followed by all 11 browser tests against that exact compiled checkout. All 540 tracked files remained unchanged. Only the owned dependency directory was mounted into the pinned browser container; both owned containers were label-verified and removed. Populated upgrade/retention repair evidence passed separately. No deployment or hosted resource was created.

Development-database limitations remain explicit: the later in-place full run passed 156/160, with timeout/hook/cleanup failures in import worker, import isolation, spending reports and export cascade capacity fixtures. That database had approximately 199,000 live ledger rows after failed cleanup runs. These failed runs are not acceptance evidence; existing data was preserved. Fresh disposable verification above passed all corresponding assertions without changing tests, statement timeouts or CI. Automatic approval review rejected an earlier proposed environment-reloading verification script before execution because it could target development settings. The replacement never loaded database settings from a file: it supplied explicit disposable URLs, checked exact loopback port/container labels before every command, and rejected development URLs. It completed successfully. Current code is locally verified; its own PR/current CI/merge gate remains pending.

Task 3C.2 PR: https://github.com/FSS-Ltd/the-joint-app/pull/17 against `main`. Independent reviewed implementation `3e10afd7e246088907afbdc5e0336a73569a2679`; privacy fix `8f01626`, canonical pagination fix `8781b1a`, exact clean/runtime verification `fbbdb79a63909d06ab8aabe579284aa7dea365d6`; delivery revision `7bed23a` adds verification prose only. Local acceptance is complete as recorded above. Required current-revision Foundation checks are pending; remain on Task 3C.2 until successful current CI and host-verified merge. The category-cap enhancement is a requirement update only, with implementation pending.

### Task 3C.2 merged; Task 3C.3 in progress

Host revalidation on 2026-10-23 confirmed [PR #17](https://github.com/FSS-Ltd/the-joint-app/pull/17) merged as `84ab0d43eee852dba1b8df82b9784dd37d2d29a2`. Final head `8b043d250b5ffe77d079d2c43804369b58e4c30a` passed required Foundation checks in CI `39935942660`; main CI `39936904269` succeeded on the actual merge. The prior pending entry is historical. Detailed checkout and merge evidence: [verified merge record](https://github.com/FSS-Ltd/the-joint-app/pull/17#issuecomment-6362487943).

Task 3C.3 adds owner-only settled-adult-cash and bill-reserve evidence before allocation writers. See [design](decisions/task-3c3-funding-evidence-design.md) and [implementation plan](decisions/task-3c3-funding-evidence-plan.md). Current branch `build/3c3-owner-funding-evidence`; no PR yet and no gate claimed complete. Fresh builder check found no material missing decisions. Initial strict contract test failed for the missing module; database tests reached missing SQL functions before implementation. Targeted fresh disposable PostgreSQL verification now passes 15 integration cases and one contract test; database/contracts builds and test TypeScript checks passed. API, real deletion/restore proof, full clean verification, review and PR/CI/merge remain outstanding. No development data was deleted and no deployment occurred.

Task 3C.3 implementation update: owner-only funding evidence routes, immutable private versions, encrypted exact replay, 50-entry encrypted history pages and free fresh-MFA exports now exist for active and frozen archive scopes. Settlement remains pinned to its source valuation; reserve changes append history without changing account/totals versions. Three additive migrations introduce private evidence/cutoffs, prune unjustified post-exit reserves on actual deletion, and freeze referenced valuations. The actual-purge regression first retained forbidden version 4, then passed after the forward retention fix. The source-rewrite regression first resolved an update, then passed after the source-freeze migration. Actual restore replay verifies exclusive purge, frozen history and independently justified joint history. Targeted fresh owned verification passed 18 integration/HTTP/restore cases; test TypeScript and targeted lint passed. Full clean verification, independent branch review and PR/CI/merge remain pending; this step is not complete.

Independent Task 3C.3 review at `2a02dae5cffe08337e6268406bc5413e7d68984e` found no Critical/Minor issues and two Important items, both accepted. A case-only UUID replay regression reproduced 503 for the same key and 409 for the same valuation; canonical key/valuation normalization now passes. Added deterministic PostgreSQL lock-barrier tests for delayed source replacement and household exit, asserting no funding, audit or replay insert; revoked-session replay is denied and a genuinely new authenticated/MFA session can read/export frozen archive history. Twenty targeted integration/HTTP/lock/restore cases pass. Baseline exact clean source passed frozen install, all formatting/lint/build/types, 220 unit, 177 integration and 11 browser tests. Full checks on the fixed revision remain required before PR. No re-review was commissioned; review scope exclusions retain the documented future-feature, privileged-maintenance, legal and deployment boundaries.

Task 3C.3 final local verification at fixed revision `82a701c2df258ba7b1bc1848d49e179e17b50e94`: exact clean checkout with frozen offline install passed formatting, lint, all active-package builds, strict type checks, 220 unit tests, 179 integration tests and 11 browser tests. All 561 tracked source files remained unchanged. The populated upgrade applied all 62 migrations without rewriting legacy valuations or inventing archived funding rights. Disposable database/browser resources had verified ownership labels, loopback URLs and an independent journal; no command targeted development PostgreSQL. Whole-branch review and one regression-driven fix pass are recorded above. PR creation/current-revision CI/actual merge remain pending; no deployment and no Task C/MVP completion claimed.

Task 3C.3 PR: [#18](https://github.com/FSS-Ltd/the-joint-app/pull/18), base `main`, branch `build/3c3-owner-funding-evidence`. Published only after final local verification. Runtime/tests were checked at `82a701c2df258ba7b1bc1848d49e179e17b50e94`; later commits record verification/PR evidence only. Current-revision CI and actual merge are still required before proceeding. On the user's local-preview request, existing web/API were started on loopback; `/sign-in` and `/health/ready` returned 200. The three verified additive migrations were applied to the preserved local development database. No deployment occurred.

### Task 3C.3 complete; AUTH1 password visibility in progress

[PR #18](https://github.com/FSS-Ltd/the-joint-app/pull/18) merged at `68c03998ac782457f9392613083e973c995bda64` on 2026-10-23T11:04:39Z. Final-head CI39942648547 passed on `a0e4adbdd8f8aa9f1ae2bd7671b666839b63c5f5`, actual checkout `433371506b80303ad8ef07e5f740efdd88b05cb8`; all 27 steps succeeded, including 220 unit, 179 integration and 11 browser tests. Actual-main CI39943551326 also succeeded. Actual merge and checked merge share Git tree `9bb02ff87d59b9d577cd1f2c69243f6da1a02d02`. [Durable merge/check record](https://github.com/FSS-Ltd/the-joint-app/pull/18#issuecomment-6363441093). This supersedes the historical pending entries above. Task C and the MVP remain incomplete.

The user requested accessible password eye controls and a Clerk auth migration, preserving current login/create-account styling and working email-code verification. Confirmed scope: email/password plus Google; signed local webhook fixtures only, no tunnel. Deliver AUTH1 password visibility first, then the full Clerk migration as a separately gated step. Preserve all existing stored data and do not merge identities merely by email; whether real existing account access must migrate is awaiting clarification. Clerk keys belong only in ignored local configuration. No Clerk flow, real-email delivery, webhook activation or migration gate is complete yet. See [AUTH1 design and plan](decisions/task-auth1-password-visibility-plan.md).

AUTH1 implementation: a focused controlled PasswordField now supplies a 44px eye/eye-off button for sign-in, create-account and recovery. It preserves rules, values, autocomplete, styling and submit behavior; keyboard/pointer toggling sends no auth request. Explicit input labels/hints remain associated, the control follows hydration/pending disabled states, and revealed text disables autocorrection/capitalization/spellcheck. Six targeted isolated-browser cases passed after the missing-control regression failed as expected; desktop/mobile screenshots were inspected against current styling and the local Design references. No new dependency or provider change. Full verification, independent review and PR/CI/merge remain outstanding.

Clerk follow-up constraint verified against official documentation on 2026-10-23: development-mode MFA can be tested free, but production MFA requires a paid plan. This conflicts with the existing zero-incremental-cost launch assumption unless separately resolved before production approval. Preserve mandatory MFA; do not silently weaken it or claim a free production launch. No paid commitment, tunnel or deployment has been authorized or made. Source: https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options .

AUTH1 independent review at `65f88c17587b8d75b46bafc56d7b3eb2487e6e64`: no Critical or Important issues; implementation judged ready subject to delivery gates. Two nonblocking automated-test suggestions were recorded: use a valid email plus Enter in the no-submit regression, and inspect a maximum-length revealed password. The native non-submit button and reserved padding are correct; verify these additional input classes separately before delivery and retain the suggestions for subsequent auth-flow coverage. Review did not claim Clerk/email/webhook completion, a full existing-backend audit, cross-browser/password-manager compatibility, deployment or host-gate success.

AUTH1 additional isolated-browser proof: both valid synthetic sign-in and sign-up forms retained a 128-character password through Space/Enter toggles with zero intercepted auth POSTs. At 390px, each eye target measured at least 44px, input reserved 56px right padding and document width remained within the viewport. Synthetic screenshots were inspected; text remained clear of the control. Two additional one-off cases passed. Exact committed source `65f88c17587b8d75b46bafc56d7b3eb2487e6e64` passed frozen offline install, formatting, lint, all builds, strict types and 220 unit tests in a clean copy, with all 564 tracked files unchanged. First complete runtime attempt passed 175/179 integration cases; four export requests returned unavailable. All 15 export cases passed alone against another fresh owned database; full-suite diagnosis and browser regression verification remain pending. No failed run is acceptance evidence.

AUTH1 final local verification: exact implementation `65f88c17587b8d75b46bafc56d7b3eb2487e6e64` passed all 179 integration and 17 browser tests against a fresh label-verified disposable database and isolated production web build. All 564 tracked files remained unchanged. The earlier four export failures did not recur in either the diagnostic full run (179/179) or this unmodified final run; root cause remains unproven, so no unrelated production change was made. Frozen install, formatting, lint, types, all builds and 220 unit tests passed as recorded above. No check was skipped. Development web/API remained HTTP 200 throughout; owned test resources were removed. PR/current-head CI/actual merge remain pending.

AUTH1 PR: [#19](https://github.com/FSS-Ltd/the-joint-app/pull/19), base `main`, branch `build/auth1-password-visibility`. Source checked at `65f88c17587b8d75b46bafc56d7b3eb2487e6e64`; later changes record verification and PR evidence only. Current-head required Foundation checks and actual merge must be verified before Clerk implementation.

### AUTH1 merged; AUTH2 Clerk design

[AUTH1 PR #19](https://github.com/FSS-Ltd/the-joint-app/pull/19) is MERGED at `0e4e3643bc12d9020f738b10c43f2932b43efbdc` (2026-10-23T11:47:39Z). Final head `caed1837383789977870576f6b290567d68414ec` passed every step in required [CI39947783524](https://github.com/FSS-Ltd/the-joint-app/actions/runs/39947783524), including 220 unit, 179 integration and 17 browser tests. Actual test merge `29b2a63e6ae086ecc828cc25a14051b33099ec37` and actual merge share tree `dc1dd954382c805fedf37da75e22f0d61484bd40`. No blocking host reviews/conversations; existing protections retained. Local main refreshed cleanly. Actual-main [CI39948592227](https://github.com/FSS-Ltd/the-joint-app/actions/runs/39948592227) also completed SUCCESS on the actual merge; every job and step succeeded. Historical pending AUTH1 entries are superseded.

AUTH2 branch `build/auth2-clerk-integration`: [proposed design](decisions/task-auth2-clerk-design.md) covers preserved custom UI, verified-code/Google flows, explicit external/internal identity mappings, session/MFA boundaries, signed local webhook fixtures and journaled deletion/restore. No product code, dependency or migration has been changed in AUTH2. Independent builder check found no additional material planning questions; design approval is pending. No implementation approval is inferred from that review. Clerk key names were absent from existing local environment files; user development setup and real-provider proof remain outstanding. Production MFA cost remains unresolved; no paid commitment or deployment.

AUTH1 cleanup: its owned git-archive verification copy was removed only after all 564 tracked files were compared with the checked implementation and merged preservation was verified. No active worktree, running preview, original Design/plan folder, ignored credentials or development data was removed. Durable merge evidence: https://github.com/FSS-Ltd/the-joint-app/pull/19#issuecomment-6364166538 .

AUTH2 design approved by the user on 2026-10-23; proceed with implementation before Clerk instance setup. [Implementation plan](decisions/task-auth2-clerk-plan.md) retains the existing native execution approach. Task 1 adds typed secret-safe configuration, official networkless Clerk signature verification and bounded authoritative session/user checks. Thirty-five credential/configuration cases pass after missing-module, expiry-race and unusable-key failures were observed. Contracts/API builds, strict test-source typing, scoped lint and all 255 unit tests passed. External IDs remain strings here; no user/session mapping, auth flow, webhook activation or Clerk migration completion is claimed. No real email/Google proof can run before user setup; existing preview/provider and data remain preserved.

AUTH2 Task 2 local evidence: 10 mapping integration cases passed on a fresh label-verified disposable PostgreSQL database. External IDs map to independent stable UUIDs; concurrent registration converges, email-only linking is denied, revoked/missing sessions cannot revive, and dual-proof collision binding preserves the existing user. Actual household leave rejects the old session and a genuinely new sign-in reads lawful archived ownership. The populated upgrade preserved exact synthetic legacy user/session rows after applying the prior 62 migrations and then the additive Clerk migration. Mapping tables remain denied to the finance runtime; narrow definer functions enforce state. API/database builds, strict test-source types, scoped lint and formatting passed. The migration has not been applied to the preserved development database; API/BFF wiring and custom Clerk flows remain in progress, with no real-provider acceptance claimed.

AUTH2 Task3 API/BFF wiring: explicit configured provider selection now retains the existing principal, household/source authorization, archive and CSRF boundaries. Clerk tokens never reach the app response or local browser storage; local/global logout persists revocation before bounded remote cleanup. A global cutoff rejects previously unregistered older provider sessions; replay cannot revoke a later genuine sign-in. Observed terminal provider sessions persist locally. The custom UI and final enrollment/reverification flows remain Task5 work; no live Clerk cutover has occurred. Targeted credentials/BFF tests pass 42/42; affected auth/accounts/archive/funding/privacy integration regressions pass 61/61 across 12 files in a fresh owned database. Repository lint, strict test-source types, web build and scoped formatting pass. No real-provider acceptance, AUTH2 PR, CI or merge is claimed.

Founder setup update 2026-10-23: the supplied Clerk Dashboard instructions select an existing development application. No API keys were supplied. CLI `whoami` reports auth_required; requested the one-time host-terminal login, without provisioning a replacement application. Six logo variants were found under ignored Design/logos; visible naming confirmation is pending because they say The Family Fund App. Preserve these originals and the current custom layout. No deployments, relay tunnels, production configuration or paid changes are authorized.

AUTH2 setup update: the founder authenticated Clerk CLI, added development keys to ignored .env, and confirmed The Family Fund App as the visible product name; the repository remains the-joint-app. Both supplied keys were compared privately against the selected existing development application and match. Derived issuer/public RSA signing key and local origins were validated and saved to ignored mode-0600 .env.clerk; no existing .env values were replaced. No replacement application, global skill installation, production configuration, tunnel or deployment occurred.

AUTH2 Task4 signed webhook handler uses /v1/webhooks/clerk, raw 64KiB requests, official signature/timestamp verification and configured instance matching. Minimal hashed event metadata and resource tombstones serialize with JIT registration. Duplicate/concurrent delivery, wrong signatures/instance, oversized payloads, ordering, JIT/deletion races, runtime table denial and unchanged application-user retention pass. Updated full focused result is 26/26 across identity/session/webhooks. A failing synthetic post-logout session used the host clock 12ms ahead of Docker; diagnostic timestamps proved the mismatch. Its creation timestamp now uses the database clock; production guards were not weakened. The disposable harness also now waits for final TCP readiness instead of the image's temporary initialization socket. The preserved preview has not switched provider or received these migrations yet.

AUTH2 Task5 implementation: the existing custom login/signup layout now uses current Core3 Clerk password, email-code/resend, Google callback, Device Trust, recovery and MFA flows. The original shared password eye remains. Runtime server configuration selects the provider without keyless provisioning or silent fallback; the official provider is inside the server-rendered body, with a small client session-change/logout bridge. Mandatory Clerk MFA/password-reset tasks retain official completion semantics inside the branded frame. New forward SQL stores explicit session-bound TOTP proof when backup codes coexist; normal authenticated access retains its proof timestamp, while existing sensitive actions enforce freshness. Security updates invalidate local proof.

Approved visible name The Family Fund App now appears in page metadata, shared identity/account headers and introduction/security copy. Original forest wordmark and F icon were copied without altering the ignored Design originals; repository naming is unchanged. Real development SDK rendering was inspected at 390px and 1280px. A valid synthetic email and 128-character password survived keyboard eye toggles, with 44px targets, 56px reserved padding, zero signup submissions and no overflow. Six flow and three provider-TOTP unit cases pass. Full unit result 271/271, focused integration 28/28 and browser regression 20/20 against disposable resources; final provider-wrapper checks follow. Formatting, all 16 package type checks, test-source types, web/API/database builds and lint pass. Sandbox-only HTTP-fixture EPERM was resolved by running verification with loopback permission, without altering product code. Real email verification, Google OAuth completion and live webhook delivery remain unverified; no live test user was created.

Clerk/Next runtime defects caught before cutover: unnecessary dynamic middleware secret propagation required an extra encryption key, and Next URL normalization converted 127.0.0.1 to localhost, causing an external self-rewrite. The fixed single-instance middleware reads its validated ambient secret; documented Next16 skipProxyUrlNormalize preserves the origin. A real SDK fresh-form error also exposed default missing_requirements status before any signup attempt existed; regression-tested resumption now requires an actual attempt ID. No authorization, origin check or MFA gate was weakened.

Founder preference: do not open Chrome. Further browser checks use headless containers or the in-app browser. The automation tab was already absent when cleanup was attempted; no further desktop browser automation will start. Current development data and port-3000 services remain preserved pending the full provider/deletion cutover checks.

Task5 final provider-wrapper verification: the rebuilt server-layout integration passes all 16 package type checks plus test-source typing, formatting and lint. All three affected Clerk HTTP/desktop/mobile cases pass again headlessly; unchanged local-provider branches retain the recorded 17 existing browser passes. The complete delivery suite will run again against the final committed AUTH2 source after privacy/restore and setup work. No AUTH2 PR or merge is claimed.

### AUTH2 Task 6 — privacy and migration acceptance in progress

The predecessor remains host-verified merged: AUTH1 PR #19, merge `0e4e3643bc12d9020f738b10c43f2932b43efbdc`. AUTH2 remains on `build/auth2-clerk-integration`, with no PR or completed delivery gate yet.

Added durable external identity references to verified deletion intents, serialized under the actor lock before local revocation. Financial purge retains Clerk mappings/session tombstones; the worker deletes only journalled external subjects, verifies structured absence and keeps failed provider cleanup pending. Existing local-provider cleanup remains supported. Restore replay now recreates terminal external-user tombstones even when the restored database predates a binding. An owned PostgreSQL proof confirms closed access on provider failure, retry/idempotence and denied JIT revival. No real Clerk identity was deleted and development data remains unchanged.

Dual-proof account linking now has a CSRF-protected BFF, thin API route and focused service. Current Clerk authenticator verification plus independently verified fresh legacy MFA and matching verified email bind the original internal UUID; no email-only binding or password-provider fallback. A forward SQL wrapper also blocks webhook-first disabled/deleted identities during linking. Disposable HTTP tests prove failed proof/revoked-or-missing session/deleted identity denial and successful preservation of the original user/household.

Development setup validates the user-selected keys without provisioning another application, preserves existing encryption/hash keys and the independent journal, and keeps supplemental settings private. Updated dev/start commands load explicit Clerk settings; the local preview now runs with the selected development instance. See [Clerk local setup](joint-app/clerk-local-setup.md). The local webhook URL remains `http://127.0.0.1:3001/v1/webhooks/clerk`; hosted delivery remains unavailable under the no-tunnel/no-deployment constraint. Clerk verification email does not require webhook delivery.

Current evidence: 281/281 unit tests passed before the final response-boundary addition; focused Clerk HTTP/session/webhook/privacy tests passed 20/20; original mapping/deletion boundary checks passed 12/12; owned restore proof passed 1/1. Initial static checks found an unused setup import and a missing explicit test process environment type; both were corrected. Final full static/build/type, fresh frozen installation, complete integration/browser verification, independent whole-branch review, PR and current CI/merge are still pending. Live email receipt/Google authorization remain untested; no Chrome, tunnel, deployment or paid commitment is authorized.

AUTH2 independent review of `0e4e364..c81e6ea` found no Critical issues. Its seven Important findings and two originally Minor UI regressions are addressed in one coordinated regression pass, with final delivery acceptance still open. No second review or invented approval is claimed.

The pass prevents initial cross-tab reload loops and persists terminal provider-session observations before first mapping. Leave and deletion complete browser sign-out, retaining completed mutation state if cleanup needs retry. Logout distinguishes revoked app access from pending provider cleanup: an encrypted, purpose-bound HttpOnly capability retries the original session/scope/cutoff for at most thirty minutes, including after browser sign-out or refresh. Later genuine sign-ins remain outside the cutoff. Provider responses must confirm the requested session is terminal; missing targets are checked again.

Backup-code sign-in uses the official SDK and routes to authenticator recovery. A persistent MFA requirement prevents factor removal during recovery from opening finance access; fresh TOTP verification remains required. Auth transitions and mandatory MFA/password tasks retain allowlisted destinations. Verification resend has a thirty-second cooldown. Authenticator enrollment again offers QR and manual setup; the pinned QR encoder runs locally and never sends the secret to a remote service.

Current local evidence: all293 unit tests and16 expanded headless Clerk browser cases passed before the final supplemental response/scope assertions. The complete recovery journey additionally passes QR rendering, manual fallback, invalid enrollment code, setup completion and rejected/successful fresh TOTP verification. Focused session/webhook/privacy tests passed22/22. Web production build, strict test-source types, formatting and lint pass. Synthetic SDK resource fixtures exercise production React components; they do not prove live email delivery, actual Google authorization or the provider-managed task internals.

Approval tooling is restored. The interrupted verification container was identified by label, image, command and read-only mount before removal. Subsequent browser runs use isolated headless containers; Chrome remains closed. All acceptance is being repeated from the final source. The earlier full integration result was200/210; the three-suite repeat was32/33 and clean predecessor comparison32/32. Those intermittent capacity/freshness failures remain unresolved until the full current suite passes; no timeout, fixture size, security gate or required check has been weakened.

AUTH2 remains implemented but unfinished and unmerged. Fresh frozen installation, latest complete integration/browser/static results, PR/current CI/merge and live development email/Google confirmation remain open. At that checkpoint, main-preview Clerk cutover was still pending. No development-data reset, live Clerk deletion, Chrome launch, tunnel, deployment or paid commitment occurred.

Fresh source `20ef895f810856e39bdf0d4adb6c66872f3539e2` passed frozen offline installation, formatting, lint, all builds/types and296 unit tests, with all657 tracked files unchanged. Its full integration run passed205/213; all eight failures were export tests, and every capacity test passed. A disposable-only probe captured a nominally fresh synthetic MFA proof0.099ms ahead of PostgreSQL; the unchanged strict database fence correctly rejected it. Test fixtures now choose a timestamp no later than either host or database time. Expired proofs remain one millisecond beyond the existing five-minute limit. Deterministic host-clock offsets of±1000ms and affected export/permission suites pass27/27 on an unmodified database. No production clock tolerance, timeout, fixture volume or security rule changed. Final complete acceptance is being repeated after this fixture correction.

AUTH2 local acceptance repairs: additive Clerk migrations were applied to the preserved loopback development database only after verifying its container, volume and database identity. Before/after row digests preserve all original columns of all46 existing tables; no seed or reset ran. Web/API/worker now run together locally, with API liveness/readiness and signup HTTP200. A Node22/Next development restart exposed unsupported `--env-file` forwarding through `NODE_OPTIONS`; the web scripts now use a supported preload, covered by two synthetic-file precedence/multiline regressions. Explicit process configuration still wins and builds remain key-free.

Human testing exposed two real authentication failures: email verification returned additional-details feedback and Google remained at its callback. Read-only public development settings and an identifier-free local status projection established that both were waiting for required `username`. The preserved custom UI now collects that field after verification, handles duplicate/invalid values safely and continues through official SDK update/finalize. The callback routes the existing incomplete signup to that form without interrupting transfer, MFA or protection challenges. The live preserved Google attempt now displays the username step; the agent did not submit it or create an account. Temporary diagnostic rendering was removed. Reference: [Clerk OAuth missing requirements](https://clerk.com/docs/guides/development/custom-flows/authentication/oauth-connections#handle-missing-requirements).

New signup-flow unit regression and both email/Google browser regressions failed before the repair. Current checks pass:299 unit tests, all19 Clerk browser cases, formatting, lint, all16 type tasks plus strict test-source types, and the web production build. The initial sandbox-only unit attempt could not open synthetic loopback HTTP sockets; the authorized rerun passed299/299. Full fresh-source integration/browser acceptance, AUTH2 PR/current CI/merge and human completion of live email/Google sign-in remain open. Preview stays available at `http://127.0.0.1:3000/sign-up`; hosted webhooks, production changes and tunnels remain disabled.

AUTH2 draft PR: [#20](https://github.com/FSS-Ltd/the-joint-app/pull/20), base `main`, branch `build/auth2-clerk-integration`. Exact source `065af1122c68a9c32dbbc16d900f63fad0cd3a74` passes fresh frozen offline installation, formatting, lint, all eight builds, all16 type tasks plus strict test-source types,299 unit tests,215 integration tests and36 browser tests. All660 tracked files remained unchanged after the full run. Owned disposable resources were cleaned; the running preview remains healthy. The tracked-source scan found no private plan/design paths or exact local secret values.

Current blockers: human final completion of live email and Google signup remains pending; the fixed live Google attempt reaches the username form. Read-only public Development settings report authenticator-app support disabled, which must be enabled and mandatory MFA tested before acceptance. Hosted webhook delivery remains outside local-only scope. Current-revision CI is pending and this draft is unmerged; no next build step may begin. Connector PR creation returned403, so the already authenticated CLI created the same authorized draft. No settings, review requirements or branch protection were weakened.

### Event-driven standard — audit recorded, runtime conversion gated

The user requires subscriptions/events instead of constant database polling as the standard for builds. Recorded this in `AGENTS.md` and `BUILD.md`, including durable state, reconnect recovery, permission-scoped subscriptions, event payload minimisation and idle-query verification. This is an engineering-policy and audit update within the current handoff; it does not implement or scaffold the subsequent runtime change.

Read-only audit: `apps/worker/src/main.ts` repeatedly checks readiness, performs maintenance/deletion checks and claims jobs on `WORKER_INTERVAL_MS` (default10000ms). Import detail polls active batches every1000ms; export status polls queued/processing jobs every2000ms; deletion receipts poll incomplete requests every5000ms. Auth/session changes already subscribe to SDK updates and `BroadcastChannel`; the resend countdown is local UI timing, not a database poll. The current app therefore does not yet meet the new standard in these four areas. Replace those loops in a separate gated delivery unit after AUTH2 is accepted and merged, preserving durable retries, expiry, leases, receipt authority and tenant permissions. No polling interval was merely increased and no worker was disabled to conceal the issue.

AUTH2 head `3d7183953befd3a2e89bb2f75a458084ef4190db` passed every step of required [CI40017715700](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40017715700); host reports its Foundation checks successful. Test-merge candidate was `f998935161e4876107ef1ecbfe89a22d40c02cb8`. The documentation revision recording this new standard needs its own current-head CI; human live email/Google/MFA acceptance remains pending, so PR20 remains draft and unmerged. No next runtime build step has started.

### AUTH2 local acceptance follow-ups

The user reports signup now goes through after the username fix; this does not separately establish both email and Google or live MFA enrollment. The selected Clerk Development instance now has authenticator apps and backup codes enabled through a validated, explicitly development-only partial CLI patch. Read-only public settings returned HTTP200 and confirmed both flags true. Sign-in/sign-up requirement flags and production settings were unchanged. The user's response to the MFA test request was intent to test, not a successful test result.

The user also requested a skippable partner invitation during local testing. Partner membership was already optional in the server model; the existing page lacked an obvious continuation. Added the native `Invite later` link to Accounts using existing styles. No fake invitation, second membership, stored completion flag or MFA bypass is introduced. A new assertion in the existing identity/MFA/invitation browser journey failed before the change because the link was absent. It now passes keyboard activation, Accounts reload without the invitation screen, return to the invitation form and the remainder of the existing invitation/session boundary journey. Mobile390/320 and desktop1280 renders were inspected with synthetic users. Formatting, lint, all16 type tasks plus test-source types, web build and an isolated all-eight-package build pass; the targeted browser journey passes1/1, with the owned clock regression2/2 also passing. Full runtime suites were not unnecessarily repeated for this navigation-only change; current-head CI will run the complete gate.

Prior documentation head `47b2255f7bf1291983120f5eeb18a8ebd2fe9c93` passed all steps of [CI40018653739](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40018653739), including299 unit,215 integration and36 browser tests. Checkout logs identify test merge `ac7c4c1` into the unchanged merged AUTH1 base. The invitation continuation remains an AUTH2 acceptance fix; the runtime polling conversion has not started.

The user has now rejected the current UI's fidelity to the supplied Design references and requested colour-adapted wireframes as the visual source for future screens, using design-craft and Stitch where useful. Treat this as a visual acceptance/design correction: preserve the working local functionality, produce reviewable reference-grounded wireframes and a canonical design contract before further restyling. No wireframe or redesign approval, deployment or subsequent runtime step is claimed. Original Design assets remain private and untracked; credentials must never enter design prompts or artifacts.

Visual review follow-up: created private Stitch project `16873688144152014118` for six reference-grounded synthetic wireframes. The user rejected oversized oval account cards and the amount summary, requested desktop glass, then explicitly extended the rectangular treatment to all screens. The visual contract now requires 6px content-card corners, 8px fields/text actions and at most 10px glass frames on mobile and desktop, reserving capsules for navigation/small chips. All-screen regeneration and final artifact acceptance remain in progress; no human approval or app restyle is claimed. The separate loopback gallery has passed 320/390/1280px image, overflow, navigation and keyboard checks before the final image replacement. Invitation code head `c5da15844ff8739d6c2e510ae636152956951588` passed required CI40021058960, actual test-merge prefix `a28f0fa`; PR20 remains draft/unmerged pending live authentication acceptance.

Final wireframe artifact evidence: six PNG snapshots and editable HTML references now use shared `docs/design/wireframes/geometry.css`; the contract and reference brief consistently require rectangular cards/actions on every screen, with visible glass framing retained. Each screenshot was visually inspected. All five saved mobile sources pass actual CSS geometry, no horizontal overflow and zero-script checks at320/390px; desktop passes at1280/1440px. The gallery passes six-image loading, valid navigation, no overflow and keyboard skip-link checks at320/390/1280px. Full formatting and diff whitespace checks pass. Snapshot/source SHA-256 hashes are recorded in the manifest, and a credential-pattern scan reports zero matches. Stitch DOM-edit output and downloaded HTML were inconsistent, so locally verified semantic shape attributes and shared CSS are authoritative; compiled reference styling is retained with scripts removed. No production dependency or application restyle was introduced. The local gallery is served only at `http://127.0.0.1:3100/wireframes/`; web/API/worker remain on their existing preview. These are self-reviewed proposals, not human-approved screens, and no later runtime unit or deployment has started.

AUTH2 CI acceptance repair: design head `5c1d89569d98f5010828af5c0f38ba7644b20677` passed installation, formatting, lint, builds, types, unit and integration checks in [CI40025392507](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40025392507), but browser acceptance was 35/36. The Google case expected a transient callback URL. A synthetic navigation trace proves the browser visits `/auth/callback?next=archive`, then correctly returns to `/sign-in?next=archive` for the authenticator challenge. Waiting for the normal MFA state reproduced the old assertion failure deterministically. The test now observes the actual callback request and asserts the stable sign-in destination after its existing code-entry step; production auth, retries and test deadlines are unchanged. The callback-request approach passed ten repeated cases; the final version passes all 19 Clerk browser tests. An extra early-readiness assertion was caught and removed during this verification. Lint, all 16 package tasks plus strict test-source types, formatting and whitespace checks pass. Local container cold startup was separately observed at 49.4 seconds after three preflight failures before tests; only a temporary diagnostic startup watch was used, with no repository/CI timeout change. Owned resources were cleaned, and the existing app/API/gallery remain available. Latest-revision CI and human authentication acceptance remain required; PR #20 is draft and unmerged.

Menu clarification and CI follow-up: the user confirms the rejected menu was the existing app menu, not navigation in the new mockups. Recorded that distinction in the visual contract; replacement remains planned UI implementation, with no new screen approval or runtime restyle. Head `6d046217005578e370a5ef1e2379393aff44bf67` passed static/build/unit/integration checks and the repaired Google case in [CI40028650445](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40028650445), but the monthly journey failed its offline-heading assertion: 34 browser tests passed, one failed and one serial successor did not run. The cause remains unproven. Against an archived build with identical relevant runtime code, the unchanged static offline case passed ten repetitions and the monthly journey passed three repetitions. Temporary diagnostics in the disposable archive confirmed an activated controller, HTTP200 from the service worker and the offline heading on every monthly run. Initial local attempts lacked synthetic Auth settings and did not exercise the assertions; the successful runs used loopback-only Auth fixtures and an owned disposable database. No development finance data was reset, no diagnostics entered tracked source, and no production code, test deadline or retry policy changed. Owned verification resources were removed. App, API readiness and gallery each return HTTP200. The documentation-only follow-up requires fresh current-head CI; the intermittent offline failure is recorded, not claimed fixed. PR20 remains draft and unmerged pending CI and live authentication acceptance.

### AUTH2 merged; UI1 reference foundation authorised

The user explicitly confirms that email signup, Google sign-in and authenticator setup all complete. Required [CI40030313769](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40030313769) passed for head `f2c90a4bb3dd2b3405d82e40f0c21ca802cc711b`, actual test-merge prefix `b4dfb57` into AUTH1 base `0e4e3643bc12d9020f738b10c43f2932b43efbdc`: frozen installation, formatting, lint, all builds, strict types,299 unit,215 integration and36 browser tests. The previously intermittent offline case passed; its earlier failure is not claimed causally repaired. Host verification reports PR20 merged by the human at `2026-10-23T22:03:58Z`, merge commit `de6c38e8b86983ed6d3808cdf613a4cbe5031809`, also the verified main revision. No protection or review requirement was bypassed. AUTH2 delivery gate is complete; production deployment/pricing/residency remain later gates.

The user then explicitly approved applying the revised wireframes and visual contract as the UI baseline. Started standalone **UI1 — Reference foundation** from that verified merge on `build/ui1-reference-foundation`; see [implementation plan](superpowers/plans/2026-10-23-ui1-reference-foundation.md). Replace the existing menu and apply shared geometry, forest/ivory framing and desktop glass across existing frames, preserving functional flows and permissions. Available destinations replace future Goals/Wealth labels until those features exist. The navigation regression failed on the unchanged build because More and a direct CSV import destination were absent. UI1 is implementing, not complete; no next unit has begun.

UI1 local implementation and verification: extracted typed shared application navigation with four direct mobile destinations and a native More disclosure, plus the desktop rail. Signed-in household and local/Clerk security screens now use the same menu; old link menus were removed while retaining sign-out and all existing destinations. Report links preserve scope only where applicable. Shared frames use forest/ivory/sage/apricot, opaque rectangular panels with 6px corners, controls with 8px corners and glass framing with 10px corners. The public introduction, manifest and generic offline document retain the visible Family Fund brand; the static shell is versioned to v2 without caching financial or authentication responses. No package dependency, backend, schema, permission or polling change was introduced.

Observed regressions were corrected before PR creation: missing More/import navigation, 24px cards, logo/header and setup-grid zoom overflow, a focused input behind the dock, and a dark-menu focus ring overridden by shared form styles. Native scroll padding and contextual focus tokens preserve usable keyboard focus. Introduction and real identity journey assertions now follow the actual accessible navigation, retaining their original auth/MFA/invitation checks. Actual synthetic mobile and desktop renders were visually inspected, including populated spending/budgets and setup/auth. The six approved wireframe image/source hashes and geometry hash remain unchanged.

Final local verification passes: all eight package builds; all 16 package type tasks plus strict test-source typing; formatting, lint and whitespace review; 299 unit tests; all 43 browser cases with disposable synthetic finance data, loopback Auth fixtures and an owned headless browser. An initial restricted unit run hit loopback-listener EPERM and passed after appropriate execution permission. A parallel type launcher hit Next's build lock; the sequential rerun passes. Full database integration was not repeated locally for this UI-only change; the required CI gate will run it. The owned clock check also passes 2/2 and the populated disposable upgrade preserves its original identity/session rows. Public working-source scan: 684 files, zero private paths and zero exact local secret-value matches. Existing app, API readiness and gallery each return HTTP 200; development finance data, private settings and journal remain intact. UI1 is locally verified, awaiting one independent whole-branch review and its own PR/current-head CI/verified merge. It is not complete, and no next unit has started.

UI1 independent whole-branch review of `de6c38e..5a1cef1` found one Important accessibility defect and no Critical or Minor findings: an expanded More disclosure could cover later focused household controls. Exact-style synthetic Chromium measurements reproduced the overlap at390×640 and390×844. One remediation pass preserves the native disclosure, closes it when focus leaves, and handles Escape by restoring summary focus. React events add no polling, global listener or dependency. The new keyboard regression failed before the repair and passes after it; all44 full browser cases then passed against the repaired production build. Lint, formatting and the web build pass. UI1 remains unmerged; PR/current CI and merge evidence are still required.

UI1 delivery: [PR #21](https://github.com/FSS-Ltd/the-joint-app/pull/21) targets `main`, verified base `de6c38e8b86983ed6d3808cdf613a4cbe5031809`. Implemented/review-remediated head `b8ec4e923ec2073b148924759da3e7e2ab0be472` passed local acceptance, including all44 browser cases and the final16 package type tasks plus test-source typing. Initial [CI40036821416](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40036821416) is in progress; no CI success or merge is claimed. This delivery-record revision also requires its own current-head check. Main still requires strict Foundation checks, a PR and resolved conversations, with force pushes/deletion prohibited and no configured approval count. Next permissible action is current-revision CI/review verification and the already-authorised compliant merge; UI2 remains gated.

### UI1 merged; UI2 account workspace in progress

Host verifies [PR21](https://github.com/FSS-Ltd/the-joint-app/pull/21) MERGED at `2026-10-23T23:04:09Z`, merge commit `ad856a4ab90dfefcaa32feea67b858f83b0d35ff`, matching refreshed main. Final head `bb3474176c711deeaf6fae8dcf11be5afd36530a` passed every applicable step of [CI40036868861](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40036868861), actual test merge `c95ea967cc85f6c674d538be4d2f208f7ff421ba`: frozen install, formatting, lint, builds, types,299 unit,215 integration and 44 browser tests. No unresolved conversations or protection bypass. This supersedes historical UI1 pending states. PR body preserves exact merge evidence.

Started UI2 on `build/ui2-account-workspace` from that verified merge. [Plan](superpowers/plans/2026-10-24-ui2-account-workspace.md): compact account rows and selected-account desktop/mobile workspace, using the approved reference composition and existing real routes/permissions. No paginated client-summed wealth total, new backend, schema or polling is planned. UI2 is not complete; no PR or next unit yet.

UI2 implementation: added compact permission-labelled account rows, a loaded-count overview with real Add account/Import CSV destinations, and a detail-only account selector. Desktop uses an account column; mobile uses a native disclosure. Container-aware widths correct the observed populated-page200% zoom overflow. Existing dated values, debt/partial/missing labels, ownership/sharing rules, MFA guards and mutation callbacks remain intact. No client-summed wealth total or new polling was introduced. The current account remains selected beyond the first list page and deduplicates when loaded. Synthetic mobile/desktop renders were inspected against the approved references.

Local evidence so far: all 8 builds, formatting, lint and 299 unit tests pass. An initial concurrent-build unit attempt passed 296/299 with 3 child-process deadlines; the sequential unchanged rerun passes 299. The original layout regressions failed before implementation; an intermediate 7-case run passed. A further pagination regression reproduced the missing selected account and was repaired. The 8-case follow-up passed 7 with a final post-navigation assertion failure; its captured destination already contained the expected account. Account-switch assertions now wait for their synthetic data response before the unchanged heading check.

Full 52 browser acceptance is still in progress and has not passed. First fixture setup failed with an uninformative Prisma schema-engine error before browser assertions; a fresh diagnostic attempt applied the same migrations, preserved populated legacy rows and passed the owned clock 2/2 check. The initial engine failure is not claimed causally fixed. The inherited temporary local browser helper forces 20s, stricter than the repository’s native 30s default, and a geometry case reached that limit; subsequent local acceptance must follow repository timing without changing project deadlines or retries. Final strict test-source types, complete browser acceptance, one independent branch review and PR/current CI/merge remain required. UI2 is implemented but unfinished; no subsequent delivery or deployment has started.

UI2 verification follow-up: strict typing caught a missing explicit `.js` extension in the new test-fixture import; corrected before delivery. All16 package tasks plus test-source types now pass. All8 account-workspace browser cases pass using unchanged repository Playwright timing, including pagination/selection beyond page one, values-only controls, explicit retry, exact large negative values,320/390/1280px layouts and 200% zoom. Final source fixes synchronize account-switch assertions with their actual synthetic data response and make the existing narrow-spacing selector effective. Formatting passes. The earlier full run was deliberately stopped through its verified owned Playwright PID after the temporary20s override caused failures in changed and unchanged cases; it is not passing evidence. Owned fixtures were cleaned. Full acceptance will run with native repository timing, alongside a read-only review of the same immutable source. No repository timeout or retry was increased. PR publication still requires local verification and review remediation; UI2 remains unmerged.

UI2 final local acceptance: all 52 browser cases pass with native repository timing (4.3 minutes), using an owned fresh database, loopback synthetic Auth and pinned headless Chromium. The populated upgrade preserved its original identity/session rows and the owned clock regression passed 2/2. An additional 800px geometry/render case passes independently, covering the documented wide-tablet column at normal and 200% zoom; both actual tablet renders were inspected. Final CI will run all 53 browser cases together. All eight package builds, all 16 type tasks plus test-source typing, lint, formatting and 299 unit tests pass. Full database integration was not repeated locally for this frontend-only step; required CI runs the complete suite.

Independent whole-branch review of `ad856a4..3fb1b76` approves the code/design with no Critical or Important findings. Its single nonblocking plan-breakpoint note is resolved by documenting the intentional 720px content-width adaptation under the approved tablet guidance; the global navigation rail remains at 1100px. No production correction or second review was required. Actual 390/800/1280px list/detail screenshots were compared with the approved references. UI2 is locally verified and awaiting PR/current-head CI and host-verified merge. No next step or deployment has started.

UI2 delivery: [PR #22](https://github.com/FSS-Ltd/the-joint-app/pull/22) targets verified main `ad856a4ab90dfefcaa32feea67b858f83b0d35ff`. Reviewed production head `3fb1b7603f02037d11a45b32e4425fd319271cae` and locally checked delivery head `6b9cbfd8f58842229615a973e00d8011afdd2971` are recorded in the PR. Initial [CI40041404599](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40041404599) is in progress; this delivery-record revision requires a fresh current-head check. Public scan covers 691 files with zero forbidden private paths and zero exact local secret-value matches. Main still requires strict Foundation checks, a PR and resolved conversations, with force pushes/deletion prohibited and no configured approval count. No CI success or merge is claimed yet; only CI/review verification and the already-authorised compliant merge may advance UI2.

### UI2 merged; UI3 activity workspace in progress

Host verifies [PR22](https://github.com/FSS-Ltd/the-joint-app/pull/22) MERGED at `2026-10-23T23:53:07Z`, merge `b823be013722022dcc7e7433708129b47d9d2231`, matching refreshed main. Head `1584a449371c0b11bb4f960bac5d2f8e7bc1d8de` passed all required [CI40041522719](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40041522719) checks on test merge `1643ff0eb8d6d34c91bb21f15ebdaced8fb25929`: frozen install, formatting, lint, builds, types,299 unit,215 integration and53 browser tests. No protection bypass or unresolved blocking review. PR body preserves final evidence, superseding historical UI2 pending entries. Local main was clean and the account preview returned HTTP200.

UI3 starts from that verified base on `build/ui3-activity-workspace`. [Plan](superpowers/plans/2026-10-24-ui3-activity-workspace.md) applies the already-approved activity reference composition to the ledger/detail. Existing financial semantics and permissions remain; no dependency, schema, new polling or deployment is planned. Runtime polling conversion, CSV review composition and the remaining functional roadmap are still outstanding. UI3 is not complete and no subsequent unit has started.

UI3 implementation: compact signed rows, a labelled loaded-record count, visible search plus native advanced filters, explicit account/ownership scope and a glass-framed source summary now follow the approved activity/desktop references. Existing correction, classification, split, transfer and private-note forms/callbacks remain. Manual entry follows the ledger; private notes follow classification without waiting for the taller split column. Removed only the old activity styles made unused by this extraction. No dependency, backend, migration or recurring request was introduced.

UI3 local evidence: all8 package builds, all16 type tasks plus strict test-source typing and299 unit tests pass. The initial restricted unit run passed297 with2 failures and an unhandled loopback-listen EPERM; the unchanged permissioned rerun passes299. All10 focused activity browser cases passed before the final private-note placement correction. A measured split-field regression first failed at75.5px and passes after the scoped responsive grid; the private-note geometry regression then failed before moving its unchanged form into the classification column. Final full-browser acceptance remains in progress. Earlier browser attempts exposed a test targeting a span instead of its native summary and a label locator returning0 while the accessible combobox-role locator returned1; corrected tests retain original deadlines/retries. One cold-run transient0-count assertion did not reproduce under a synthetic request trace; no production causal fix is claimed. Actual390/1280px renders were inspected against approved and original reference images. Independent whole-branch review and PR/current CI/host merge remain required; no next step or deployment.

UI3 independent review of `b823be0..615dd89` found no Critical or Important findings. Accepted both Minor coverage suggestions: submit all five filters while the native disclosure is closed; assert the extreme amount and long description at200%zoom, then activate the long row by keyboard and wait for its real synthetic detail response. No production code changed after review. Parent inspected refreshed final-note390/1280 renders. Existing filtered-empty wording/startup duplicate reads, CSV review composition, polling conversion and new event lifecycle guarantees remain separate follow-ups; UI fixtures do not establish new server enforcement.

First full63 browser run passed61, failed the existing monthly offline-shell heading check and consequently did not run its paired serial case. All UI3 cases passed. The same two monthly/offline cases then passed unchanged in a fresh owned diagnostic run (34.9s), with clock2/2 and preserved legacy identity/session rows. The original failure is not claimed causally fixed; no app or timeout/retry change was made for it. A direct static-only probe without required owned DB configuration failed setup and is not runtime evidence. Final complete acceptance, including review coverage additions, is running. Full strict types, lint and formatting pass after those additions; all production sources remain at reviewed615dd89. No PR or next step yet.

UI3 final local acceptance passes all63 browser cases (3.0 minutes) on the reviewed production source plus both accepted coverage additions, using native repository timing and owned disposable fixtures. This includes the existing offline cases; the earlier offline failure was not reproduced and is not claimed causally fixed. The populated upgrade again preserved exact legacy identity/session rows and the owned clock check passed2/2. All8 builds, all16 package type tasks plus test-source typing, lint, formatting and299 unit tests pass. Full215 database integration was not repeated locally for this frontend-only step; required CI runs that suite. Final390/1280 list/detail renders were inspected, with320/800/200%zoom/reduced-motion/keyboard and shared/CSV/empty/error boundaries covered. Independent review has no blocking findings; both minor suggestions are now verified. Public scan:698 tracked files, zero private paths or exact local secret-value matches. UI3 is locally verified and awaiting PR/current-head CI/host merge; no later step or deployment started.

UI3 delivery: [PR23](https://github.com/FSS-Ltd/the-joint-app/pull/23) targets verified main `b823be013722022dcc7e7433708129b47d9d2231`. Independently reviewed production head `615dd89ade891751bad4561c05c753cb746b3657`; final locally checked source/test head `6f85236aa5cf1cfa2c030297988297b9d1005118` matches the tested archive for all10 changed runtime/test files. Initial [CI40044690705](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40044690705) is in progress; this delivery-record revision requires its own current-head check. Main still enforces strict Foundation checks, a PR and resolved conversations, with force pushes/deletion prohibited and no configured approval count. No CI success or merge is claimed. Next action is current-revision CI/review verification and the already-authorised compliant merge; no subsequent unit or deployment has started.

### UI3 merged; UI4 CSV review workspace in progress

Host re-verifies [PR23](https://github.com/FSS-Ltd/the-joint-app/pull/23) MERGED at `2026-10-24T00:29:29Z`, merge `d4f46ed59df94aa903a49b0149afe52d3d41430b`, matching clean local/origin main. Final head `fa979ef044841be70e71cea38ca843bec80601e5` passed every step of [CI40044743226](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40044743226) on test merge `3a54ad789182160c23d664943249c5f21264d884`:299 unit,215 integration,63 browser and all installation/static/build/database setup checks. No blocking reviews, unresolved conversations or protection bypass. Initial40044690705 was superseded/cancelled, not passing evidence. PR body records final merge/CI proof. A transient SSL fetch failure ended before the successful retry refreshed main; development preview returned200 and user data was preserved. This supersedes historical UI3 pending states.

UI4 starts on `build/ui4-csv-review-workspace` from that verified merge, following the [plan](superpowers/plans/2026-10-24-ui4-csv-review-workspace.md). Scope is existing CSV upload/mapping/history/summary/source review using approved references. Financial safety, permissions and current request lifecycle remain; polling conversion is still separately outstanding. No dependency, backend, schema, new recurring read, deployment or subsequent step is claimed.

UI4 implementation applies the approved rectangular/glass composition to upload, explicit mapping, import history, six separately labelled batch counts and source review rows. Summary and step components are presentational; existing request handlers, rejected-row acknowledgement, dirty guards, Keep/Skip, duplicate handling and destructive confirmations remain unchanged. Counts are direct response fields and explicitly distinguish valid rows from committed transactions. No filename, automatic syncing, permission or event guarantee is invented.

Local focused acceptance passes all16 CSV cases (2.0m), including signed/debit-credit mapping, keyboard operation, version-reset acknowledgement, history retry/paging, state-specific controls, exact int64 amounts, long source values and320/390/800/1280px at200%zoom. Visual review of synthetic mobile/desktop renders found and corrected cramped count cards and a clipped amount-layout selector. Initial test mistakes around acknowledgement and navigation were corrected with actual response synchronization; independent page geometry cases retain the original30s timeout. All8 builds,16 package type tasks plus strict test typing, formatting and lint pass. Final units/full browser acceptance and one independent whole-branch review remain in progress. UI4 has no PR or merge yet; no subsequent unit or deployment has started.

UI4 independent review of `d4f46ed..fc8c294` found no Critical or production-code issues, one Important test regression and no Minor findings. The new step list added three list items to existing unscoped pagination assertions. The first full79 run confirmed exactly that failure (103 rather than100), with78 passing. One correction scopes both unchanged100/1 assertions to Source row review; no production change, deadline increase or retry change. The final complete79-case run passes (4.4m).

Final local acceptance: all8 builds,16 package type tasks plus strict test-source typing, lint, formatting and299 unit tests pass. The owned clock check passes2/2; disposable populated migrations preserve exact legacy identity/session rows. Full215 database integration was not repeated locally for this frontend-only step; required CI runs it. Mobile/desktop synthetic upload and source-review renders were inspected against approved frames and original references. All changed runtime/test files match the tested archive. Public scan covers705 tracked files with zero forbidden private paths or exact local secret matches. Existing web/imports, API readiness and gallery return200 with authorised loopback access. Development data and real Clerk settings remain intact. UI4 is locally verified, awaiting its PR/current-head CI/actual merge; no later build step or deployment has started.

UI4 delivery: [PR24](https://github.com/FSS-Ltd/the-joint-app/pull/24) targets verified main `d4f46ed59df94aa903a49b0149afe52d3d41430b`. Independently reviewed production head `fc8c29497f891986e9813eda483d0e657f2fd12a`; locally checked source/test head `b083a3af403e814b62f9d34c9394a9b8a955a85b` includes the accepted scoped pagination correction. All16 changed runtime/test files match the tested archive. Initial [CI40049040238](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40049040238) is in progress; this delivery-record revision also requires its own current-head check. Main still requires strict Foundation checks, a PR and resolved conversations, with admin enforcement, no force pushes/deletion and no configured approval count. No CI success or merge is claimed. Next action is current-head/test-merge CI and review verification, followed by the already-authorised compliant merge. No later build step or deployment has started.

### UI4 merged; UI5 spending and category-cap workspace in progress

Host re-verifies [PR24](https://github.com/FSS-Ltd/the-joint-app/pull/24) MERGED at `2026-10-24T01:24:38Z`, merge `9dcdebf0e9aff517584fabe3016345770e5e8e5c`, matching clean local/origin main. Final head `4032cb1f17ab8430b244c54a644a7949e53e7552` passed every applicable step of [CI40049082029](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40049082029), actual test merge `71f95e71f33d0edafd52b3853928886e5a085c0c`: 299 unit, 215 integration, 79 browser and installation/static/build/database setup checks. No blocking reviews, unresolved conversations, self-approval or bypass. Superseded40049040238 is cancelled, not passing evidence. PR body records final proof; local app/API/gallery returned200 after refresh. This supersedes historical UI4 pending states.

Started UI5 on `build/ui5-spending-cap-workspace` from that verified merge. [Plan](superpowers/plans/2026-10-24-ui5-spending-cap-workspace.md): existing home, budgets and monthly review using approved composition, exact cap remaining/zero/overspend states and clearly conditional saving guidance. Preserve report/mutation authority and source meaning; do not invent available balances, stored saving targets or money moved. The broader project, missing home/goal data and event conversion remain outstanding; this step does not redefine their completion. No subsequent step or deployment.

UI5 implementation applies the approved opaque rectangular/glass composition to home spending, saved category caps and monthly review. Cap cards show exact remaining, reached-zero and overspend states, including refunds and zero caps, with red text/rulers and conditional saving guidance. Home shows an explicitly limited cap summary with scoped all-caps/review links. Report calculation time and latest booked source date are distinct; available balances and stored saving targets are not invented. Existing budget save/version rules, owner coverage controls, report invalidation, exact tables and financial permissions remain unchanged.

Observed regressions were corrected before PR publication: absent cap/source presentation; a saved-budget table showing zero actuals without a summary; unknown review counts appearing as zero; unknown source date claiming no records; and an undefined approved error-colour token that also affected rejected-import warnings. Colour checks first reproduced forest text where red was required, then pass with the single semantic token. A schema-valid extreme refund exposed a computed remaining amount wider than external money input bounds; extracted shared exact BigInt formatting for computed differences, preserving the original currency/range validation for external report money. No dependency, backend handler, schema, migration or recurring read was added.

Current local evidence: all8 builds,16 package type tasks plus strict test-source types, lint, formatting and309 unit tests pass. All29 focused browser cases pass (21 spending plus8 import), including exact monetary states, computed allowance bounds, budget version writes, source/unknown/error states, shared read controls, idle read counts, scoped navigation and320/390/800/1280px at200%zoom/reduced motion. Normal mobile/desktop caps/home and stressed review renders were inspected against approved and original references. Public scan:716 files, zero forbidden private paths or exact local secret matches. Full100 browser acceptance and one independent branch review remain in progress. UI5 has no PR or merge yet; no subsequent unit or deployment has started.

UI5 final local acceptance: all100 browser cases pass (3.9m) on reviewed production revision `33b2e1afa649f566cd27bb4ceb6e11642f42557e`. The owned populated upgrade preserved exact legacy identity/session rows and the clock check passed2/2. Independent whole-branch review found no Critical or Important issues; its one Minor suggestion was accepted as a four-cap home-subset/navigation regression, which passes separately (1/1,3.3s). Production code is unchanged after review. Final added-test lint, formatting and strict test-source types pass. Required current-revision CI must run all101 browser cases together and full215 database integration; that integration suite was not repeated locally for this presentation/pure-formatting step. Earlier all8 builds,16 package type tasks,309 unit and29 focused browser checks remain applicable. UI5 is locally verified, awaiting PR/current CI/host merge. No subsequent unit or deployment has started.

UI5 delivery: [PR25](https://github.com/FSS-Ltd/the-joint-app/pull/25) targets verified main `9dcdebf0e9aff517584fabe3016345770e5e8e5c`. Independently reviewed production head `33b2e1afa649f566cd27bb4ceb6e11642f42557e`; locally checked source/test head `6b75e38b250deb3d647e0033ef7e699bba1c2a78` includes the accepted subset-navigation regression. All20 changed runtime/test files match the tested archive. Initial [CI40052186182](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40052186182) is in progress; this documentation revision requires its own current-head check. Main still enforces strict Foundation checks, PRs, resolved conversations, admin enforcement and no force pushes/deletion; required approval count is0. No CI success or merge is claimed. Next action is current-head/test-merge CI, review/conversation verification and the already-authorised compliant merge. No later unit or deployment has started.

### UI5 merged; UI6 privacy and archive workspace in progress

Host re-verifies [PR25](https://github.com/FSS-Ltd/the-joint-app/pull/25) MERGED at2026-10-24T02:07:52Z, merge `6cf7d4e77425048b84ef90bc3f99c748d21cc6cb`, matching clean local/origin main. Final head `0071a3a93747ab9ca6d47e1574c6fd9eb627ad71` passed every step of [CI40052211847](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40052211847) on actual test merge `6f844385d89d4b0b5d0746800a89cbe98d1b8f34`:309 unit,215 integration,101 browser,8 builds,16 type tasks and installation/static/database setup. No blocking reviews, unresolved conversations, self-approval or bypass. Superseded40052186182 is cancelled. PR body records exact final proof. Local web/API/gallery return200. This supersedes historical UI5 pending states.

UI6 starts on build/ui6-privacy-archive-workspace from the verified merge, following the [plan](superpowers/plans/2026-10-24-ui6-privacy-archive-workspace.md). Privacy export and read-only owner archive adopt the approved composition while preserving existing lifecycle/permissions. No backend/schema/dependency/new polling/deployment or next unit. Existing event conversion and broader goal/data capabilities remain outstanding.

UI6 implements a named, glass-framed export scope with loaded/selected counts and preserved permission labels. Privacy context precedes distinct destructive choices; confirmation requirements and mutations are unchanged. Archive account selection is compact/labelled, selected history shows exact dated values and source-labelled signed rows, and private notes wrap safely. Extracted archive activity/context keep pages focused; existing request/hooks/permission invalidation remain. Focused13 browser cases pass, including both routes at320/390/800/1280px and200%zoom, exact int64 amounts, keyboard selection, export body/download route, confirmation cancellation, shared values-only labels and stale history removal after scope failure. Mobile/desktop synthetic renders inspected against original references. All8 builds,16 package types plus strict test types,lint,format and309 units pass. The first unit attempt hit loopback EPERM (307pass/2fail); unchanged permissioned rerun passes309. Full browser acceptance, independent review and PR/current CI/host merge remain pending. No later unit or deployment.

UI6 independent whole-branch review at `a3a67f5dcfdcbd8e71d69d7cd9d6b2b0e9357caf` found no Critical issues, one Important amount-wrapping issue and one Minor stress-fixture gap. Accepted both in one pass. A new390px browser regression observed the sign and decimal fragment each spanning2 lines rather than1. Controlled thousands-group wrapping now retains sign/currency with digits and the decimal fraction with its final numeric group, preserving exact text; principal type adapts at narrow content widths. The fixture override now supplies actual long labels to household privacy as well as archive, with an explicit checkbox-label assertion. All13 focused cases pass after fixes (15.6s); stress renders inspected. The first full114 browser run passed (3.9m) before these refinements; a new full114 run is required on final production code. All8 builds,16 type tasks/test types,lint andformat pass after fixes. No final full-suite or merge claim yet.

UI6 final local acceptance passes all114 browser cases (3.2m) on review-fixed production revision `69765d0`, with native repository timing/retries. Owned clock2/2 and exact populated legacy identity/session preservation pass again. All8 builds,16 package type tasks plus strict test-source types,lint,format and309 unit tests pass. All13 focused cases pass after the coordinated review fixes; normal/stress mobile/desktop renders were inspected. All11 changed runtime/test files match the tested archive. Public scan723 files has zero forbidden private paths or exact local secret matches. Full215 database integration was not repeated locally for this UI-only step; required CI runs it. User preview/API return200 and development data remains intact. UI6 is locally verified, awaiting PR/current-head/test-merge CI and actual authorised merge. No later unit or deployment has started.

UI6 delivery: [PR26](https://github.com/FSS-Ltd/the-joint-app/pull/26) targets verified main `6cf7d4e77425048b84ef90bc3f99c748d21cc6cb`. Independent review head `a3a67f5dcfdcbd8e71d69d7cd9d6b2b0e9357caf`; locally verified review-fix head `69765d0`; final locally checked source/test head `c73c32ecd733160298a49258b03060ca3677e889`. All11 runtime/test files match the tested archive. Initial [CI40054084926](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40054084926) is in progress; this delivery-record revision requires its own current-head check. No CI success or merge is claimed. Next action is final-head/test-merge CI, protection/review/conversation verification and already-authorised compliant merge. No later unit or deployment has started.

### UI6 merged; UI7 identity and household workspace in progress

Host re-verifies [PR26](https://github.com/FSS-Ltd/the-joint-app/pull/26) MERGED at2026-10-24T02:34:00Z, merge `1ff2b6f5606f696e47775551de416e839fd2ed98`, matching clean main. Final head `d635103611cb3143059ba791014f73f42bc0f2f4` passed every step of [CI40054116267](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40054116267) on actual test merge `2f42624f991ad44d6f989ae9535f725485e01f92`:309 units,215 integration,114 browser,8 builds,16 type tasks and setup/static checks. No blocking reviews, unresolved conversations, bypass or self-approval. Superseded40054084926 is cancelled; PR body has final exact proof. Local privacy/archive/API returned200; user data preserved. This supersedes historical UI6 pending states.

UI7 starts on build/ui7-identity-household-workspace from that verified merge, following its [plan](superpowers/plans/2026-10-24-ui7-identity-household-workspace.md). Scope is shared identity/setup composition, readable authenticated desktop forms and household panels; provider/auth handlers and permissions remain. Broader home/goals/event work remains outstanding. No subsequent unit or deployment.

UI7 implementation gives authenticated identity pages the shared ivory/glass desktop workspace, with introduction above bounded forms; mobile keeps the forest setup composition and content-width padding. Household details are a focused labelled component beside the optional invitation at wide content widths. Existing create/logout/invitation/provider handlers and conditions remain unchanged. Stale feature copy now describes manual/CSV support and unavailable direct connections. The first3 baseline cases reproduced the old side-by-side desktop introduction and missing overview region. All38 new focused cases pass (19.8s), including7 route families at320/390/800/1280px and200%zoom, actual synthetic Clerk email/MFA/backup-code controls, optional invitation/no POST, member/full suppression, long labels/links and keyboard retry focus. Visual review caught an868px code field; bounded560px form regression failed before repair. A corrected keyboard-modality regression reproduced low-contrast apricot focus on the new ivory workspace; it now uses the approved brown focus. All8 builds,16 type tasks/test types,lint,format and309 units pass before final unused-container cleanup; final build/full browser/review remain required. No PR, next unit or deployment yet.

UI7 final local acceptance: all152 browser cases pass (3.4m) on reviewed production `9599841c5d07732bb16e1bacae6cbf93e8333529`, with exact populated legacy identity/session rows preserved and clock2/2 passing. Independent whole-branch review found no Critical/Important issues. Its Minor generated-link coverage suggestion is accepted: strengthened existing case passes1/1 (3.4s), checking full readonly value, textarea/page overflow and control geometry at320/390/1280px and200% CSS zoom. Production is unchanged after review; final added-test lint, formatting and strict test types pass. All8 builds,16 package type tasks,309 unit tests and38 focused cases pass. All12 runtime/test files match the tested archive. Public scan730 files: zero forbidden private paths or exact local secret matches. Full215 database integration was not repeated locally for this presentation step; required CI runs it and the final152 browser cases together. Synthetic SDK/CSS-zoom checks do not independently establish live external Clerk delivery, native browser zoom or other browser engines; no such claim is made. Broader product/event work remains unfinished. UI7 is locally verified, awaiting PR/current CI/actual merge; no later unit or deployment.

UI7 delivery: [PR27](https://github.com/FSS-Ltd/the-joint-app/pull/27) targets verified main `1ff2b6f5606f696e47775551de416e839fd2ed98`. Independently reviewed production head `9599841c5d07732bb16e1bacae6cbf93e8333529`; locally checked source/test head `3ac475b2798c0f563ff56c65acc005e2ae703ddd` includes the accepted link-geometry addition. All12 runtime/test files match the tested archive. Initial [CI40055876459](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40055876459) is in progress; this delivery-record revision requires its own check. Main enforces strict Foundation checks, PRs, resolved conversations and admin enforcement, with0 configured approvals, no force pushes/deletion. No CI success or merge is claimed. Next action is final-head/test-merge CI and review/conversation verification, then already-authorised compliant merge. Local household/security/API return200. No later build unit or deployment.

### UI7 merged; EVENT1 worker wakeups in progress

Host re-verifies [PR27](https://github.com/FSS-Ltd/the-joint-app/pull/27) MERGED at `2026-10-24T03:00:45Z`, merge `f9948fdc2ee79d6843454277a813330d1db96985`, matching clean main before this branch. Final head `17ab464922886d635fa6c6b4e46fc81855c491bf` passed every applicable step of [CI40055923423](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40055923423) on actual test merge `755927fe806a57f5f8a4896c175adf9d4d7d86c6`:309 unit,215 integration,152 browser,8 builds and16 type tasks plus static/setup checks. No blocking reviews or unresolved conversations, bypass or self-approval. Superseded40055876459 is cancelled; PR body has final proof. This supersedes historical UI7 pending states.

EVENT1 starts on `build/event1-worker-wakeups` from that verified merge, following the [plan](superpowers/plans/2026-10-24-event1-worker-wakeups.md). Scope replaces the local worker scan with committed empty PostgreSQL hints, serialized wakeups and durable due-time scheduling. The additive migration preserves business data, RLS, handler authorization and lease fences. No new dependency, deployment or paid service. Browser import/export/deletion status subscriptions remain EVENT2, and broader home/goals work remains outstanding.

Implementation adds a dedicated authenticated LISTEN connection, reconnect reconciliation/backoff, a restricted aggregate deadline function, meaningful row triggers and scheduling indexes. Idle workers stop querying. Job retry/lease recovery, import and export expiry/backlogs, failed-import reconciliation and configured deletion retries retain bounded execution. `WORKER_RETRY_MAX_MS` replaces the former normal scan interval. Scheduler regressions first failed for the missing module and now pass4/4. Initial database cases passed5/6 after two synthetic fixture constraints were corrected (export session and deletion lease pair); full final integration/browser acceptance is running. All8 builds and16 package types pass; strict final test typing, lint/format/unit results, independent whole-branch review and PR/current-head CI/merge remain required. No subsequent unit has started.

EVENT1 review at `4bb5b1d` found no Critical issues and three Important lifecycle problems. Accepted all in one coordinated pass: notifications could bypass failure backoff, locked overdue work could trigger1ms scans, and closing pg during authentication could leave its connect promise pending. New regressions first observed12 calls instead of1 during cooldown,501 instead of1 during500ms of overdue work, and close still pending after2s. Cooldowns now coalesce later hints; a settled overdue/no-hint cycle retries after1s. Connection/LISTEN waits race lifecycle cancellation before transport cleanup. All7 focused units pass; a real locked-row recovery regression is added.

Before review fixes, full222 database integration and152 browser cases passed, including exact populated identity/session preservation. Final review-fixed source passes all8 builds,16 package types plus strict test-source typing,316 unit tests,lint andformat. Test typing corrections use one generated Prisma module identity and explicit NODE_ENV=test for the child process. An initial offline frozen installation failed for a missing Clerk cache entry; the unchanged online frozen installation succeeds with no dependency/lockfile change. Full final runtime acceptance remains in progress; no PR or merge claimed yet.

EVENT1 final local acceptance passes on review-fixed production/source `47bbf0704e401c49e7933dc92c0e851c050a107d`:316 units,223 database integration (140.89s),152 browser (3.2m),8 builds,16 package type tasks plus strict test-source types,lint andformat. Exact populated legacy identity/session rows remain unchanged after all migrations. The added real locked-row regression passes; all three review findings are resolved in the single coordinated pass and self-reviewed. All13 changed runtime/test files match the tested secret-free archive. Public scan739 files finds zero forbidden private paths or exact local secret matches. Synthetic browser checks do not independently verify live external provider delivery or additional browser engines. No applicable local suite is omitted. EVENT1 is locally verified, awaiting PR/current-head/test-merge CI and host-verified authorised merge. No later unit or deployment has started.

EVENT1 delivery: [PR28](https://github.com/FSS-Ltd/the-joint-app/pull/28) targets verified main `f9948fdc2ee79d6843454277a813330d1db96985`. Independent review head `4bb5b1d`; locally verified review-fixed production/source `47bbf0704e401c49e7933dc92c0e851c050a107d`. Initial delivery head `8ca87abe9228c55617fa365a696379fab9db4821` started [CI40058280144](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40058280144); it is not passing evidence. The acceptance-record formatting check failed before publication but publication proceeded in error; formatting is corrected in this delivery-record revision, which requires fresh current-head CI. Main retains strict Foundation checks, PRs, resolved conversations and admin enforcement,0 configured approvals, no force pushes/deletion. No CI success or merge is claimed. Next action is current-head/actual-test-merge CI, review/conversation verification and authorised compliant merge. No subsequent unit or deployment.

### EVENT1 merged; EVENT2A authenticated status transport in progress

Host re-verifies [PR28](https://github.com/FSS-Ltd/the-joint-app/pull/28) MERGED at `2026-10-24T03:33:27Z`, merge `f2d6f47a0f78242fcc034ab2db5d3b5fcbaa4606`, matching clean main before this branch. Final head `a788992349179f4010906fab1f242fa486fa9c09` passed every applicable step of [CI40058315045](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40058315045) on actual test merge `bc684492a53cbd442941845f249c9df85d7d9f0e`, with verified base/head parents:316 units,223 integration,152 browser,8 builds,16 types plus strict test types and static/setup/cleanup checks. No blocking reviews, unresolved conversations, bypass or self-approval. Initial40058280144 failed documentation formatting and never counted. PR body records final proof. Local migration and root types/builds pass; web/API200 and the restricted event worker remains running. This supersedes historical EVENT1 pending states.

EVENT2A starts on `build/event2a-authenticated-status-streams` from that verified merge, following the [plan](superpowers/plans/2026-10-24-event2a-status-streams.md). It adds authenticated streaming transport before EVENT2B replaces import/export/deletion browser polling. The approved UI baseline is preserved; broader home/goals and full event conversion remain unfinished. No deployment, paid service or new dependency. The initial observer module was missing (RED); five focused lifecycle cases now pass, covering initial subscription races, idle reads, coalescing, expiry, revocation, backpressure and cleanup. Database authority adapters, HTTP/BFF transport, complete verification and PR/CI/merge remain in progress. No subsequent unit starts before this gate.

EVENT2A implements a bounded API status hub/observer, fixed-topic shared PostgreSQL listener, meaningful status/authority triggers and purpose-bound receipt deadline. Resource adapters recheck existing import/export/archive/deletion authority and internal verified credential expiry, with no row data in the protocol. BFF routes enforce same-origin credentials, strict selectors, receipt-cookie scope, bounded handshake/frames, safe empty-protocol decoding and upstream/downstream cancellation. Existing React consumers and approved visuals remain unchanged for EVENT2B.

Focused evidence: database2/2 and initial real import transport1/1 pass; expanded initial7 lifecycle/authority cases pass. New native browser acceptance passes1/1(7.3s) through real Next/Nest/local Auth/PostgreSQL, including HttpOnly credentials, ownership revocation and receipt access after clearing sign-in cookies. API occupied-port startup regression first left the child alive after failure; cleanup now passes1/1. A BFF abort regression first left a downstream read pending; corrected and BFF/protocol/existing privacy cases pass23/23. Current all8 builds,16 package types plus strict test types,339 units and focused lint pass. Initial strict typing caught fixture header unions and a closure narrowing issue; both corrected without suppressions. Final requester/archive coverage caught immutable exited-membership protection in fixture cleanup; moved that case to an independent terminal archive fixture rather than weakening finality. Its expanded8-case run is in progress. Full234 integration/153 browser acceptance, independent review, public scan and PR/current CI/merge remain required; no completion or subsequent unit claimed.

EVENT2A focused coverage is green:8 real API transport cases plus2 notification/receipt cases, occupied-port cleanup1/1 and native browser1/1. The archive fixture now uses an independent exited membership and a genuine new synthetic external session; the original household-bound session is correctly rejected. No guard is weakened or membership reactivated. Frozen offline installation, all8 builds,16 package type tasks plus strict test-source typing,339 units,format andlint pass on the immutable source archive. Public scan767 files: zero forbidden private paths or exact local secret-value matches. Full234 database integration/153 browser acceptance and one independent whole-branch review remain required before PR publication. EVENT2A is implemented but unmerged; EVENT2B and broader home/goals remain unfinished. No deployment or subsequent unit.

EVENT2A independent whole-branch review of `f2d6f47..720a09f` found three Important issues and no Critical or Minor findings. All three accepted in one correction pass: terminal export Job failures/cancellations now issue empty committed notifications (heartbeat bookkeeping stays silent); credential expiry has an independent timer during slow resource reads; deadlines crossed during authorization trigger one bounded reconciliation. Two observer regressions first failed, then passed; the export-job notification regression first observed zero wakeups, then passed all three terminal modes. Import/export adapters preserve deadlines relative to observation start.

The first full local run passed234 integration cases and152/153 browser cases. The new browser case failed only during teardown because the shared privacy fixture retained already-deleted synthetic user IDs across suites. Its successful cleanup now clears both ownership lists. The final full run remains in progress. Updated units pass342/342; all8 builds, lint and formatting pass. Strict test typing exposed source/dist generated Prisma type mismatch in two new tests; those tests now import JobsRepository from the same built module as their fixture clients. No type assertion, production API change, timeout increase, retry or guard weakening. No PR, subsequent build unit or deployment yet.

EVENT2A final local acceptance: reviewed production plus corrections at `b7de9f831a84e7d472a50ec68f456a877d079a89` passes342 unit,235 integration and153 browser cases (3.6m). All8 builds,16 package type tasks plus strict test-source typing, formatting and lint pass. Two test-only source/dist imports were corrected after the full runtime run; the affected11 database/transport cases pass again with those exact imports. All43 changed runtime/test/configuration files match the immutable checked archive. Populated migration preserves exact legacy identity/session rows. Public HEAD scan covers767 files with zero private paths or exact local secret matches. The initial teardown failure is causally addressed by clearing the successfully cleaned fixture lists; no production behavior, guard, timeout or retry was weakened. All three independent Important findings have RED-to-GREEN coverage; no deferred Minor findings. EVENT2A is locally verified, awaiting PR/current-head CI and verified merge. EVENT2B consumers remain unchanged and the broader goal remains active; no deployment or subsequent unit has started.

EVENT2A delivery: [PR29](https://github.com/FSS-Ltd/the-joint-app/pull/29) targets verified main `f2d6f47a0f78242fcc034ab2db5d3b5fcbaa4606`. Initial head `8730ff7cdfc7682d4281a55ec7a3fd8ea540347f` contains independently reviewed `720a09f` plus tested corrections `b7de9f8` and the local acceptance record. Initial [CI40224625221](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40224625221) is in progress; this delivery-record revision requires its own current-head check. No CI success or merge is claimed. Next action is final-head/test-merge CI, review/conversation/protection verification and the already-authorised compliant merge. No subsequent unit or deployment has started.

EVENT2A [CI40224668098](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40224668098) on `3332c2f728a90f4abe6edde362331568f6fe5e95` failed:152/153 browser cases, with the new status fixture receiving `EADDRINUSE` on API port3702. Every preceding installation/static/build/database/unit/integration check passed. CI runs2 browser workers; the prior local1-worker run masked shared fixed ports between privacy and status suites. The status fixture now owns separate3771/3772 ports and its matching origin, preserving existing privacy ports. Full153 browser acceptance is rerunning locally with2 workers and unchanged native timing/retries. The failed run is not passing evidence; PR29 remains unmerged and no next unit has started.

EVENT2A concurrency correction passes all153 browser cases locally with2 workers (1.9m), matching CI concurrency. Static typing16 tasks plus strict test-source typing, lint and formatting pass;43 runtime/test/config files match the tested archive and public scan remains767/0/0. Production code is unchanged from the reviewed corrections;342 unit,235 integration and8 builds remain applicable. The previously failing test now coexists with the privacy suite without port contention. No worker-count reduction, retry, timeout increase or guard bypass. The correction requires a new current-head CI run before authorised merge.

### EVENT2A merged; EVENT2B browser subscription conversion in progress

Host re-verifies [PR29](https://github.com/FSS-Ltd/the-joint-app/pull/29) MERGED2026-10-25T19:29:09Z, commit `dc13725fc4843659b2887095275b9926df0c24cb`, matching clean local/origin main. Final head `46f004dcc150ccde5c73e36f5776ec84190ff8c4` passed every step of [CI40225620656](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40225620656), actual test merge `059f616ee2ba60e86e0ba60fa180ec8c5677c26e` with exact base/head parents:342 unit,235 integration,153 browser(two workers),8 builds,16 type tasks plus strict test typing and installation/static/database checks. No blocking review/conversation; protections retained with no agent bypass or self-approval. Superseded40224625221 is cancelled;40224668098 failed the corrected fixture-port collision. PR body records final evidence and successful local activation, superseding historical pending states. No deployment.

EVENT2B starts on `build/event2b-status-subscriptions` from that verified merge, following the [plan](superpowers/plans/2026-10-25-event2b-status-subscriptions.md). Replace import/export/deletion browser polling with authenticated subscriptions, preserving approved composition, domain permissions and mutation safety. Full home/wealth/goals and the wider project remain outstanding; no scope reduction or completion claim.

EVENT2B implements same-origin bounded browser subscriptions for import detail, household/archive exports and deletion receipts. Initial/change hints drive serial/coalesced authorized reads; idle resources make zero recurring status reads. Disconnects hide displayed data, reconnects reconcile, and invalidation closes streams and clears authority. Import draft restoration retains only opaque version/page/filter/Keep-Skip choices after a fresh same-version read; row errors disable saving, and authority epochs fence late child mutations. Ready/terminal resources remain subscribed for expiry/revocation. No dependency, schema, deployment or financial calculation change.

Local focused acceptance at `52c73d9c451a91f55891aff0e62ec6c7836c5b2c`:23 browser cases pass with two workers, including the reproduced late-mutation and row-recovery regressions. Inspected actual390/1280 import/privacy renders against the approved design contract. Frozen offline installation,355 units(two local workers),8 builds,16 package type tasks plus strict test-source typing, formatting and lint pass. Earlier sandbox loopback denials, unchanged setup-test timeouts and a browser fixture/connection stall are failed attempts, not passing evidence; the temporary helper now bounds its connection wait and fixture diagnostics tolerate an absent page. Production/CI test deadlines and retries remain unchanged. Full real database/API/BFF/browser acceptance, independent whole-branch review and PR/current CI/merge remain required. The wider project goal remains active.

EVENT2B independent review of `dc13725..0d44c2a` found two Important recovery issues and no Critical/Minor or declined findings. Both accepted in one correction pass: a shared retryability policy preserves opaque import choices and export handles after transient retry exhaustion, including HTTP408/429, while authority/protocol failures clear them. New browser regressions first reproduced lost choices and missing export retry, then pass manual recovery of the unchanged batch/original job without another export POST. No second review, new dependency or schema change.

Final local acceptance at `49df96cb75f46f73b3d73732030843f6d4710920`:366 units,235 database integration cases and166 browser cases(two workers,2.1m) pass. All8 builds,16 package type tasks plus strict test-source typing, frozen offline installation, formatting and lint pass. The populated migration rehearsal preserves legacy identity/session rows. All29 changed files match the checked archive; public scan779 files finds zero forbidden private paths or exact local secret-value matches. Local development data and ignored originals remain untouched. This is locally verified and awaiting PR/current-head/test-merge CI and verified authorised merge; no subsequent unit or deployment has started.

EVENT2B delivery: [PR30](https://github.com/FSS-Ltd/the-joint-app/pull/30) targets verified main `dc13725fc4843659b2887095275b9926df0c24cb`. Initial head `20fdaa3bd905ad6df1e7fd0ea0526f61cfc20db0` contains independently reviewed code plus correction `49df96c` and the local acceptance record. Initial [CI40242699206](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40242699206) is in progress; this delivery-record revision requires its own current-head and actual test-merge success. Final CI/check/merge evidence is recorded in the PR body. No merge, subsequent build unit or deployment is claimed.

EVENT2B [CI40242749618](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40242749618) on final documentation head `7ea3ffcf970d2d8f3bef8129fd96a1005bc0db12` failed234/235 integration tests: the existing501-row multi-export/private-note fence proof exceeded its unchanged15s deadline while overlapping other import/export fixtures. Browser checks did not run and are not counted as passing. The unchanged proof measured13517ms in a four-worker local full run and1647ms alone. It now belongs to the existing serial capacity group; all assertions, data, explicit transaction races, the15s deadline and regular four-worker integration concurrency remain intact. The corrected four-worker suite passes235/235; the proof takes1666ms. This test-only scheduling correction needs a new current-head/test-merge CI run before authorised merge. No product change, subsequent unit or deployment.

## AUTH3 — Ten-minute inactivity lock

State: implementing on `build/auth3-idle-session-timeout`, based on verified PR30 merge `f1c609fb77c8c3ba13bc73a5263e787ebb0eeb04`. User selected ten minutes inactive, fresh sign-in after expiry, and rejected the Continue-to-account prototype. That prototype was removed before this step.

Session activity uses the existing `lastSeenAt`; a forward migration adds a locked deadline function and strengthens financial/archive/deletion scope guards. No new column, data backfill, dependency or deployment. Passive API reads, token refresh and subscriptions never renew inactivity. Explicit trusted interaction is coalesced to at most one activity POST plus CSRF bootstrap per five seconds per protected page instance. Cross-tab messages contain only a committed-activity hint and require authenticated reconciliation. The absolute/provider session cap, MFA proof age, permissions, logout cleanup and session-independent deletion receipts remain authoritative.

Local verification: full integration242/242 with populated upgrade preserving exact legacy rows, plus28/28 supplemental identity/scope/open-stream-expiry tests; full unit374/374; full browser168/168 with two workers (2.1m); eight builds, sixteen package type tasks plus test types, formatting and lint. Initial browser runs found anonymous invitation, fixture, reconnect/draft and cross-tab logout regressions; fixes retain original assertions and timeouts. One spending render missed its unchanged5s assertion deadline; isolated unchanged flow passes2/2 with report100ms and identity117ms, and the final full browser passes. Temporary timing code was removed before that final run. Synthetic390/1280 lock screenshots inspected, with keyboard focus and no overflow. Public-file review:792 files, zero private-plan/design/env paths and exact local secret matches. Independent review, PR, current-head/test-merge CI and merge evidence are pending. This step is not complete. Glass refinement and subsequent feature work remain gated on its verified merge. Nothing deployed.

### Requirement intake — late-MVP statement conversion

On26 October2026 the user added a bank-statement-to-CSV converter near the end of the MVP. Recorded as [STMT1](decisions/statement-to-csv-converter.md), R04 and a late Phase4 unit before founder rehearsal/acceptance. Intended scope: local PDF conversion, verified scanned-PDF/OCR support, review/correction before CSV generation, exact money/date preservation and the existing account permissions, provenance and duplicate checks. Original statements are not uploaded to third-party AI or retained server-side by default. This is planning only; no parser, dependency, bank-format claim, deployment or subsequent implementation step has started. AUTH3 remains the active delivery unit.

AUTH3 review correction: independent whole-branch review of `f1c609f..9db9bbd` found four Important lifecycle issues and no Critical/declined findings. One correction pass preserves terminal sign-out recovery, keeps authorized drafts mounted while concealed, drains activity hints received during pending reads before deciding expiry, and gates signed-in/accepted invitation content. Three controller and five browser cases first reproduced the failures, then pass. Extracted lock rendering and separate landmark IDs preserve readable components and unique hidden/visible targets. No second review or server-policy relaxation.

Final local result after corrections:377/377 unit,243/243 integration and172/172 browser (two workers,2.2m); eight builds, test-source types, formatting/lint and diff checks pass. One capacity test hit15s while independent verification checks ran alongside it; with the suites run sequentially the unchanged proof takes1691ms and the entire integration suite passes. No assertion, deadline, fixture size or CI concurrency was weakened. Frozen installation succeeded with the unchanged lockfile. Deferred Minor: full-document navigation resets the per-page activity throttle; no background polling is introduced. PR, current-head/test-merge CI and verified merge remain pending.

AUTH3 delivery: [PR31](https://github.com/FSS-Ltd/the-joint-app/pull/31) targets main `f1c609fb77c8c3ba13bc73a5263e787ebb0eeb04`. Reviewed implementation `9db9bbd` plus verified correction head `2824103e87123ccd88c7d4214aadba7371c8f5bc` passed [CI40324102226](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40324102226): all27 steps success,377 unit,243 integration and172 browser. Actual checkout/test-merge `bf5457a727b7efda558a567baa47e21761aaa723` has exact parents main plus2824103 and tree `128f45eab9c9265aac4161104df0ea550847abda`; verified through both CI checkout logs and GitHub commit metadata. Public review covers794 files, zero original private-plan/design/env paths or exact local-secret matches.

This delivery-record revision requires its own current-head and actual test-merge success before authorised merge. Final check/review/protection and actual merge evidence will be recorded in the linked PR body. No merge, subsequent implementation unit or deployment is claimed here. The forward migration has been applied successfully to the preserved local project database on loopback15432 without reset/seeding or changes to existing user rows.

AUTH3 final-CI follow-up: [CI40330321785](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40330321785) on delivery head `cb71e8bfaed627c9c8bbef7732169e8f3c343a95` passed377 unit and243 integration but failed one archive408 browser-retry case (171/172). Reproduction found1/12 then2/20 failures: installing the mock clock after app timers reset the performance clock mid-click; session concealment occurred between pointerdown/up, before any export POST. The retry file now installs its clock before navigation, matching the existing Clerk fixture pattern. No production code, retry assertion, timeout or concurrency changes. Early-install candidate passes40/40, and the corrected full owned harness passes172/172 (2.4m), with test types, lint and formatting clean. This correction requires new current-head/test-merge CI; no merge is claimed.

## AUTH3 merged; UI8 solid glass in progress

Host confirms [PR31](https://github.com/FSS-Ltd/the-joint-app/pull/31) MERGED at 2026-10-26T16:52:09Z, merge `23f822884960ea2c2c154f0c6f6cbb2f616dcc8d`, matching refreshed main. Final head `2b4d767b52d8ba1a238dd0ed809d489ef4fb6c55` passes all 27 applicable steps of [CI40362000497](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40362000497): 377 unit,243 integration,172 browser(two workers), frozen installation, eight builds, package/test types, formatting and lint. Actual checkout/test merge `1081d5666da069eacfd950f3285c2267d2272d36` has verified base/head parents and tree `26d48f9d94c29ab21f531cb3ebcd6783283a4df1`; the actual merge has the same tree. No blocking reviews or unresolved conversations. Required protections retained, no bypass or self-approval. The PR body preserves final evidence and the superseded failed-clock-test run. AUTH3 is complete; the documented per-page activity-throttle Minor remains deferred. No deployment.

UI8 starts on `build/ui8-solid-glass` from that verified merge, following the [plan](superpowers/plans/2026-10-26-ui8-solid-glass.md) and [user refinement](decisions/ui8-solid-glass.md). Remove nested decorative frames across existing families and use barely transparent glass with solid/reduced-transparency fallbacks. Preserve rectangular shapes, approved palette/layouts, navigation, permissions and working flows. Inspected both original desktop/mobile references and captured baseline synthetic390/1280 renders; existing baseline 3/3 cases pass. No later feature, deployment or new dependency.

UI8 local presentation checks: the rebuilt production source passes all 52 focused family/navigation/keyboard/zoom cases. Inspected actual synthetic sign-up and household renders at 390/1280px, mobile dashboard/caps/privacy and desktop import review; nested decorative frames are removed while labelled rejected/overspend/destructive states remain distinct. All eight builds, sixteen package type tasks plus test types, formatting, lint and 377 unit tests pass. Frozen offline installation succeeds without lockfile changes. Composite contrast over black/white backing (source-value calculations before CSS minification): secondary text at least 5.29:1, forest at least 10.41:1, error at least 5.94:1; white/sage on forest at least 10.74:1/8.47:1. Solid/reduced-transparency fallback logic inspected in source; additional browser engines and native preference settings are not independently verified. The first 52-case attempt used the predecessor build and counts only as baseline, superseded by the rebuilt pass. Public scan: 796 files, zero forbidden private paths or exact local-secret matches. Full browser acceptance and independent review are in progress; no PR, merge or later unit is claimed.

UI8 full local acceptance on implementation `81faf50474c1091cd95d9c33e1984fb64d856019`: all 172 browser cases pass with two workers (2.9m), plus 28 focused real database/session/stream cases and exact populated migration-row preservation. All eight changed runtime files match the built secret-free archive. The full 243-case database suite remains mandatory in CI; it was not repeated locally for this CSS-only step. Independent whole-branch review is in progress. No subsequent build unit or deployment.

UI8 user correction: the first96% white treatment was too flat. Restore clearer frosting with92% white, a soft white-to-sage highlight and a fine lit edge/shadow, keeping frame removal. The sign-in issue was confirmed as an existing browser session rendering a disabled credential form. Added a focused entry gate that checks app authority before dashboard navigation, preserving explicit destinations, setup, MFA, recovery, provider tasks and legacy linking; stale sessions clear auth, and transient failures offer manual retry without polling. New continuation unit and seven browser cases first reproduced missing behaviour. The initial reviewer of81faf50 found no Critical/code-defect Important issues but withheld acceptance for this new feedback; both Minor findings are accepted: navigation now honours reduced transparency, and final contrast reporting uses compiled colour values. Revised verification remains in progress; no PR or merge is claimed.

UI8 coordinated correction evidence: the dashboard destination test first failed, then passes in the full 378-unit suite. Seven browser cases first failed on retained sign-in/absent cleanup or retry; they now pass. A further linking regression first failed to reach the proof form, then passes after routing the existing409 migration response through the established completion/link flow. All 13 targeted entry/visual cases pass (9.0s), including normal/recovery/provider-MFA gates, empty-household setup, explicit archive continuation, expired-session fresh editable credentials and manual retry with no background reads. Rebuilt eight packages and sixteen package type tasks/test types plus lint pass. Inspected revised synthetic390/1280 sign-up/household renders with the single frosted panel. Conservative compiled-composite minima: supporting text5.1:1, forest10.1:1, error5.7:1, white/sage on forest10.7:1/8.4:1. Public scan798 files finds zero forbidden paths or exact local-secret matches. Final full browser acceptance and current-revision PR/CI/merge remain required; no second reviewer or deployment.

UI8 final revised local acceptance: 378/378 unit tests, 181/181 browser cases (two workers, 4.3m), 28/28 focused database/session/stream cases, eight builds, sixteen package type tasks plus strict test types, formatting, lint and diff checks pass. Populated upgrades preserve exact legacy identity/session rows. All 17 runtime/test files match the checked archive. Revised material and authorized sign-in entry are included; the earlier 172-case/source96% results are historical only. No applicable assertion, timeout, retry or concurrency was weakened. Full243 integration remains required in CI. Additional engines, native transparency preference settings and live-user redirect confirmation remain unverified; no claim of those checks. PR/current-head/test-merge CI and verified merge remain pending. The full project goal remains active.

UI8 delivery: [PR32](https://github.com/FSS-Ltd/the-joint-app/pull/32) targets verified main `23f822884960ea2c2c154f0c6f6cbb2f616dcc8d`. Final locally verified implementation `2b6216efe6be7ba1c2fd97bf2474d230df0f82ff` includes the user/review corrections. This delivery-record revision needs its own current-head and actual test-merge CI success. Final revisions, all check results, review/protection verification and actual merge evidence will be recorded in the linked PR body. No merge or subsequent unit is claimed. Source remains local with authorised GitHub source/CI delivery only; no deployment.

## UI8 merged; Task 3C.4 atomic allocations in progress

Host re-verifies [PR32](https://github.com/FSS-Ltd/the-joint-app/pull/32) MERGED at2026-10-26T17:35:50Z, merge `6e12e906ef68ff7e936264603f6d365b17627a56`, matching clean local/origin main before this branch. Final head `6c3b5382236656fd4b4cd6df58b6d314b231fc47` passed all27 applicable steps of [CI40368504919](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40368504919):378 unit,243 integration,181 browser, frozen installation, formatting/lint, eight builds and package/test types. Actual checkout/test merge `361bedd8391b0bb0c387bc3e2ba8dffced47c196` has exact base/head parents and tree `c6a7a6b297af0650daebcdffb391240740c27362`, equal to actual merge. No blocking reviews or unresolved threads; protections retained with no bypass/self-approval. The user confirmed the refreshed local flow works. Superseded40368451835 is cancelled. This supersedes historical UI8 pending records; the PR body preserves final evidence. No deployment.

Task 3C.4 starts on `build/3c4-atomic-goal-allocations` from that verified merge. Funding predecessor [PR18](https://github.com/FSS-Ltd/the-joint-app/pull/18) is also host-verified MERGED with successful required checks. [Design](decisions/task-3c4-allocation-design.md) and [plan](superpowers/plans/2026-10-26-3c4-atomic-goal-allocations.md) activate selected-source atomic owner allocations with private source-version vectors, immutable history and privacy lifecycle before contributions/projections/screens. Shared goal metadata never grants source control. The existing-assets step does not move money or add a dependency/service. UI8 and the private reference baseline remain binding for later screens.

Initial contract tests failed for the missing allocation module; the new strict versioned write/view/history contracts pass19 focused cases with existing contract fixtures, including exact amounts, fractions, source-vector completeness, out-of-scope intentions and conserved underfunding. The never-exposed allocation DTO advances to schemaVersion2 before its first runtime endpoint. The new storage integration first reached missing AccountAllocationState; an initial additive-storage run passes3 cases. Prisma generation then caught a missing composite unique key for the one-to-one state relation; the schema/SQL are corrected and current-source build/fresh verification remain required. Storage remains runtime denied and no allocation writer/API is active. No subsequent build unit or deployment.

3C.4 internal lifecycle verification: exact owner/source admission and releases,
frozen history and actual deletion/isolated restore proof are implemented. The
corrected full database run passed 265 cases; added delayed-change and commit-hint
cases passed focused checks. Final lifecycle regression and API delivery remain
in progress. No allocation migration has been applied to the development database,
no PR has been raised for this incomplete unit, and no deployment has occurred.

3C.4 lifecycle checkpoint: all 270 integration cases pass on internal revision
fb9dd10, including exact allocation admission, frozen privacy/restore, commit
hints and bounded export planning. Export JIT compilation was scoped off for
the existing 500-record helper after reproducing a five-second transaction
expiry; no deadlines or permissions were relaxed. Owner API, final review and
PR/CI/merge delivery are still pending. Development storage remains unchanged.

3C.4 owner API is locally verified on `98a3440a441a577a9319f65e07f7247f0982a4ef`
(tree `9a17b4fb1070f20d0875aaa92f21c8c1a7881be7`): a fresh secret-free
source copy passes frozen installation, formatting, lint, eight builds, sixteen
package type tasks plus strict test-source types, 385 unit, 282 integration and
181 isolated browser cases. Fresh and populated upgrades preserve exact prior
identity/session and financial records without invented allocation history.
The public scan reports 833 tracked files, zero forbidden private paths and zero
exact local-secret matches. No checks/deadlines/permissions were weakened.

The owner routes, encrypted replay/cursors, frozen archive and free fresh-MFA
exports are documented in `docs/api/goal-allocations.md`. Source authorization is
checked before account locks and again after waits; export MFA freshness is
checked after reads too. Independent whole-branch review and the current-head
PR/CI/test-merge/host-merge gate remain pending. This is not Phase 3 completion.
No allocation migration or service restart has touched the personal development
stack; no deployment, hosted database, tunnel or paid service was introduced.

3C.4 independent review of `6e12e90..098266a` read all 46 changed files and found
zero Critical, Important or Minor issues. It independently reran 31 contract and
arithmetic cases under Node 22.23.3 and confirmed the supplied full verification
logs. No second review or code correction was needed. Accepted scope limits:
allocation UI/subscription registration remains Task E; active JSON export pages
are current authorized views, not a frozen multi-request snapshot; there is no
public source-archive action outside supported household exit; contributions,
projections, direct providers, FX and deployment remain later gates. PR/CI/merge
are still pending, so 3C.4 and Phase 3 are not marked complete.

3C.4 delivery: [PR33](https://github.com/FSS-Ltd/the-joint-app/pull/33)
targets verified main `6e12e906ef68ff7e936264603f6d365b17627a56`.
Initial published head `2d3fc0e8f3517c24010370a7bfb4313a8600a01d`
contains the verified runtime and review records. This delivery-record revision
requires its own current-head and actual test-merge CI success. Final checked
revisions, CI results, review/protection checks and host merge evidence will be
preserved in the linked PR body. No subsequent unit or deployment has started.

## 3C.4 merged; 3C.5 shared contributions in progress

Host confirms [PR33](https://github.com/FSS-Ltd/the-joint-app/pull/33) MERGED
at2026-10-26T20:08:53Z, merge `d7ee55a3b00f5074f4fb77d3d2f039b703a77220`.
Final head `1d0b5fafe1a045542eb9137d588fdc2d301a0317` passes all27 applicable
steps of [CI40391607960](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40391607960):
385 unit,282 integration,181 browser, frozen installation, formatting/lint,
eight builds and package/test types. Actual CI checkout/test merge
`330a97fc97519f1647d99ac2cddb91d9a7f2150e` has exact base/head parents and tree
`dce51f580420cd9c266bae3f742f0496b96abc31`, equal to the host merge and refreshed
local main. No blocking reviews or unresolved conversations; protections retained
with no bypass or self-approval. Superseded40391158357 was cancelled. The PR body
preserves complete final evidence. This supersedes earlier pending checkpoints;
Phase3 and MVP remain incomplete. Personal storage and running services unchanged.

3C.5 starts on `build/3c5-shared-contribution-plans` from that verified merge.
The [design](decisions/task-3c5-contribution-design.md) and
[plan](superpowers/plans/2026-10-26-3c5-shared-contribution-plans.md) implement the
existing shared finite future-budget requirement: explicit manual GBP capacity,
dated requests, saved priorities and visible shortfalls. New members do not
inherit historical plans. No transactions, source-asset allocations, grants,
projections or screens are created. A fresh builder check reports no unresolved
design question; baseline385 unit cases pass before code changes. Native inline
execution and one final independent review continue under standing project
authorization. No deployment or subsequent build unit starts here.

3C.5 internal Task1 verification: strict capacity/plan/view/history contracts and
pure dated assessment are implemented. All407 units pass across67 files,
including22 new contract/calendar cases covering priority, shifted starts, leap
centuries,600 months, int64 aggregate overflow and out-of-window intentions.
Contracts/domain builds, strict test-source types, lint and formatting pass; the
earlier full16 package build/type tasks also pass. Self-review found an archived
selected plan could also appear active; a reproduced RED now passes with strict
mutual exclusion and a valid archive preservation case. No dependency or database
change. Root typecheck also rebuilt dependent apps through Turbo; subsequent
full verification uses isolated source copies to protect the preview. Persistence,
privacy lifecycle, API, full database/browser checks, independent review and the
3C.5 PR/CI/merge gate remain pending. This is not completed contribution delivery.

3C.5 Task2 storage checkpoint: new forced-RLS budget/participant/revision tables
and nullable legacy plan provenance pass13 real database cases with the existing
account-isolation/ACL suite. Retained history is immutable; cross-tenant links and
malformed goal-version provenance are rejected. New provenance cases first
reproduced accepted invalid history, then pass after a safe SQL constraint. Fresh
owned upgrades preserve exact legacy identity/session rows; the broader populated
financial upgrade remains pending. Prisma generation/build, strict test types,
lint, formatting and diff checks pass. All owned database containers cleaned up.
No personal database migration or service restart occurred; the ignored local
database client was regenerated during validation. Atomic writers, exit/deletion
callbacks, restore proof and API remain in progress. No3C.5 PR or completed-step
claim yet; no subsequent unit or deployment.

3C.5 Task2 persistence checkpoint: all307 integration cases across68 files and
407 unit cases across67 files pass. Narrow SQL writes serialize capacity/plan
changes, validate schedules independently and preserve over-budget intent.
Goal metadata advances the shared revision; exit ceilings, real deletion and
signed restore preserve only justified history and exact frozen timestamps.
Committed empty hints pass with silent reads, rollbacks and unchanged writes;
53-event catch-up uses bounded history. Fifty active plans are admitted, the
fifty-first is rejected atomically, and archival frees one slot.

The owned populated pre030 upgrade preserves exact legacy contribution steps,
goals, account balances/owners and identity/session rows. New provenance remains
null, with no invented budget/participants/history. All92 migrations deploy;
eight builds, sixteen package build/type tasks, strict test types, lint and
formatting pass in the secret-free copy. No new dependency, personal migration,
service restart or deployment. Native completion rerun, API/replay/exports,
browser verification, independent final review and PR/CI/merge remain pending.

3C.5 API checkpoint: strict capacity/goal-plan routes, bounded history, captured
archive lists and free fresh-MFA exports are implemented. Encrypted replay
reauthorizes the complete current scope before decryption and after waits;
sealed cursors bind actor/session, membership epoch or archive mode, budget, goal
and operation. Real cache-lock expiry proves replay is not decrypted after
authority expires. Exact replay, unchanged intentions and API reads add no
financial revision, audit or notification. No entitlement gates were added.

Fresh secret-free verification passes frozen installation, eight uncached
builds, sixteen package build/type tasks and strict test-source types, lint,
formatting,407 units,319 database integrations and181 browser tests. All93
migrations deploy; the populated pre030 upgrade preserves exact legacy
schedules, goals, balances, ownership and identity/session rows, without invented
capacity or rights. The880 public files match the verification copy; private-path
and exact local-key scans report zero matches. All owned database/browser
containers and temporary privacy journals are cleaned after verification.

See [contribution API](api/contribution-plans.md). Native task completion, one
independent final review and current-head/test-merge PR CI remain delivery gates.
3C.5, Phase3 and MVP are not yet marked complete. No contribution UI, personal
database migration, running-service restart, new dependency or deployment.

3C.5 author replay correction: a new regression reproduced404 on a completed
plan retry after goal archival. Forward migration040 separates shared authority
from active-write eligibility; existing captured/goal rights still authorize
exact replay, while new archived-goal writes remain unavailable. No earlier
migration checksum changed. The25 focused authorization/lifecycle/replay cases
pass, followed by the native full320/320 integration rerun across72 files on
`378cb10`, with all94 migrations and exact populated financial preservation.
407 units, strict types, lint and formatting pass; the881-file public scan and
source comparison are clean. No private paths or exact local key values found.

The updated user browser policy now permits only the Codex in-app browser for
local browser work. The queued container-browser rerun was stopped in its DB
phase and is not acceptance evidence; only its verified owned database/scratch
were removed. Local browser launching is disabled in the verification helper.
The earlier181-case local pass on `92c7b94` is historical. The user explicitly
authorized unchanged required cloud Chromium CI to continue; current-head CI
must provide final browser evidence. No UI changes require local inspection.

All three internal tasks are verified; one independent whole-branch review and
PR/current-head/test-merge CI/merge remain pending. This supersedes earlier
pre-correction test counts. 3C.5 is implemented but unmerged; no next build unit,
personal database migration, running-service restart or deployment has begun.

3C.5 independent whole-branch review inspected all59 files at `166a466`. It
found one important retention gap and no critical/minor issue: a later shared
goal participant outside the original budget could create a metadata revision
which their deletion missed. Real deletion reproduced head3 instead of frozen2;
signed restore independently failed its exact frozen-head proof.

The single correction pass adds forward041 discovery through captured budget
and goal-derived links before goal cleanup removes them. Existing retention
predicates exclude the already-deleted user, preserve independently justified
active data, and restore exact frozen heads/timestamps. Twenty targeted deletion,
retention, ACL and signed-restore cases pass;407 units, strict test types, lint,
formatting and the885-file privacy/source scan pass. No earlier migration,
security assertion, deadline or concurrency setting changed.

The full correction run passed315/322 cases and failed seven existing checks:
50,000-row cascade/export planning/import deadlines, spending-report timeout,
receipt expiry, worker retry bounds and restore-container startup. These are
being investigated and rerun in isolated storage; the full local suite is not
green. No completed review-fix/step claim or merge is recorded. Required current
cloud CI remains unchanged and must pass before this unit can progress.

## IOS0 — iOS-only product amendment and delivery plan

Date: 2 November 2026. Branch: build/ios0-delivery-plan. Base: main. State: documenting and verifying; no PR yet.

Live GitHub verification supersedes historical pending 3C.5 notes: [PR #34](https://github.com/FSS-Ltd/the-joint-app/pull/34) is merged at `a1c849918422016b63f427aae3525dec578b939d`. Final head `b7659a3950e9369f95c8b2715f441609beb332dd` passed required Foundation checks in [run 40415924691](https://github.com/FSS-Ltd/the-joint-app/actions/runs/40415924691). Tested merge `be9253b0afc103af97f65ce9dfdb5849b918f51a` is recorded in the PR checkout evidence. Host main matches that merge; there are no open PRs. Main requires strict Foundation checks, PRs, resolved conversations and admin enforcement; configured required approval count is zero. Standing founder merge authority remains as recorded in Task 0.2. No protection bypass or self-approval is authorized.

New instruction: family features move to Expo React Native iOS; web houses marketing, subscriptions and authorized staff analytics. Read [product amendment](decisions/ios-only-product.md) and [sequential delivery plan](superpowers/plans/2026-11-02-ios-only-delivery.md). The requested Agents Orchestrator profile supplied a read-only architecture/reuse review. Code Reviewer and Application Security Engineer review must both finish before opening this and every subsequent PR.

Build instruction: use Oasis as a reference, Expo push notifications, CI/CD and Xcode for iOS builds/submission preparation. Android Studio is reserved for separately approved Android delivery. Defer signing/push/store infrastructure until needed. Founder has final review-submission approval; no automatic submission or EAS cloud Build/Submit.

IOS0 changes documentation only. No mobile scaffold, dependency install, schema change, deployment, paid service or next-unit implementation. Native auth retains Clerk/server session policy; Expo DOM is limited to justified leaves. Existing financial/privacy/local-AI/STMT1/device/rehearsal gates remain. Exact local checks, review findings, PR and current CI evidence will be appended after verification. Next permissible implementation: IOS1 only after IOS0 current required CI and actual merged state are verified.

IOS0 Oasis reference check: read the mobile store-submission checklist, versioning guide and push implementation plan. Borrow human approval, version/build distinction and safe push lifecycle; their EAS/Android choices do not override the current Xcode/iOS-only request. Their push plan is reference material, not evidence that push is implemented. No Oasis files or service settings changed.

IOS0 independent reviews: Code Reviewer reviewed all eleven changed/new documents; two P2 findings corrected by adding explicit recurring/baseline and separate savings-feedback units, and fixing turnover cohort/MRR discount definitions. Application Security Engineer found one P2 privacy ambiguity; mandatory server-side small-cohort suppression now includes totals/filter differencing tests. No runtime security claim is made. Pre-PR local formatting and relative-link checks (eleven files, zero missing targets) passed; diff/public-scope inspection passed. Runtime suites are not rerun locally for documentation-only changes; unchanged full Foundation CI remains mandatory.

Targeted follow-up code and security reviews confirm all three P2 findings resolved; code review's minor step-label corrections are applied. No remaining material planning blocker. IOS0 is ready for its documentation PR after final formatting/diff checks; mobile implementation has not started.

IOS0 PR: https://github.com/FSS-Ltd/the-joint-app/pull/35. Initial reviewed head: `357aa86dc72000256848ae45ef50a4fb9372fc17`. GitHub connector creation returned integration permission 403; authenticated CLI created the same authorized PR. State: PR open, required current-revision Foundation CI pending, merge not yet performed. This evidence update creates a new checked revision; final head/test-merge/results and merge evidence must be verified from the host. No IOS1 implementation has started.

## IOS1 — iOS-first native shell with Android support

IOS0 [PR #35](https://github.com/FSS-Ltd/the-joint-app/pull/35) is host-verified merged at `cc1476189cd5852ee7f75335e12154c676e013dc`. Reviewed head `0b0f009d89d2ad54820700751b01fac0a256d00c` and tested merge `72b7c6151f74d1af73d44bfd03fbf1741d7bd1f0` passed [Foundation checks run 41532895065](https://github.com/FSS-Ltd/the-joint-app/actions/runs/41532895065): formatting/lint, builds, types, 407 unit, 322 integration and 181 browser tests; all applicable steps succeeded. Fresh host review found no required approvals or unresolved threads. Normal protected merge used standing authority; no bypass.

Branch: build/ios1-native-shell. State: implementing current unit only. Founder correction after IOS0 merge: **iOS first, with Android functionality required**. This supersedes IOS0's iOS-only restriction and historical wording above. Stable plan filenames/IOS IDs remain for links. Current-unit spec/plan/notices are updated together with the shell; no extra future unit begins. Shared native components must support both platforms. Xcode builds iOS, Android Studio/Gradle builds Android; CI/CD and founder final store review-submission approval remain. Production push/signing/store infrastructure stays deferred.

IOS1 local checkpoint: Mobile App Builder implemented focused shared native components and a working sharing-information sheet, with exact SDK 58/RN 0.88.1/React 19.3.0 pins isolated from web React. No auth stub, finance fixture, provider call or next-unit screen. Existing web/API/worker default development startup is preserved; mobile startup is explicit. CI adds Native bundle checks without weakening Foundation checks. Native imports reject server/database/Next/DOM runtime modules. Dependency reasons and exact pins are in the version matrix.

Local frozen install, formatting, lint, root/mobile types, root builds, 407 units, both iOS/Android release bundle exports, Expo dependency check and Doctor (20/20) passed. Parent used CUA on the live iOS 26.3 Expo Go SDK 58 runtime: entry, sharing sheet open/close, accessible headings/button names and two preferred text-size increases. Button padding/centering was corrected after real inspection; enlarged content and action remain reachable. Test text size restored. A stale Metro graph after dependency alignment was resolved by restarting only the owned Metro process on port 8082 and Expo Go on the exact test device. Other simulator sessions were preserved.

Limits: Android SDK/emulator/device runtime, full VoiceOver/TalkBack walkthrough, maximum accessibility size and signed native binary builds are not verified. Android Studio exists but adb/emulator binaries are unavailable in PATH/usual SDK location. Both platform bundles pass; this is not Android runtime certification. No push/signing/store setup or submission. Local full DB/browser suites are deferred to unchanged synthetic CI because this shell has no backend/data changes; no personal database or running web/API was touched. Independent code/security reviews and current PR/CI/merge are still pending; IOS2 must not start.

IOS1 independent whole-branch review at `e7325b5`: Code Reviewer found one P2 native touch gap plus a minor Google billing-source omission; Application Security Engineer found one P2 inherited Android storage-permission gap. Fix round 1 moves the drawn/padded button surface inside its semantic native label, blocks both unused external-storage permissions and corrects README to say no runtime permission requests. Expo merged introspection confirms both storage permissions have `tools:node="remove"`; iOS/Android exports, types, lint and formatting pass. CUA first reproduced the entry edge failure with label-center success, then verified both controls at left/right edges, top/bottom padding and centre after the fix. Visible controls exceed 44 pt height. Both P2s await targeted reviewer sign-off before PR.

Security dependency audit is not clean: zero critical, one high, two moderate and one low registry advisory. The high multer and low esbuild entries predate IOS1; minimatch already existed with added tooling paths; glob cancellation bypass is added through Expo tooling. Review found no native runtime/untrusted-pattern path or authored multer interceptor/fileFilter path. Track compatible parent/tooling updates separately, retain the ordinary delivery gate, and recheck before release. This is not a risk waiver or production security certification. No unverified major override was added to hide the audit.

IOS1 targeted re-review at `3adc5b9`: Code Reviewer passes spec compliance and code quality, both touch and Google-source findings addressed. Application Security Engineer independently re-ran merged permission assertions and confirms the storage finding addressed, with no remaining material IOS1 security blocker. Prior dependency audit and device/release limits remain disclosed. Final local relative-link review covers thirteen changed Markdown files with zero missing targets; all thirty-one changed tracked paths exclude private/generated environment files. Current unit is ready for PR; no merge or IOS2 work yet.

IOS1 PR: https://github.com/FSS-Ltd/the-joint-app/pull/36. Initial publication head: `4ec4687`. State: PR open; Foundation checks and Native bundle checks must pass on the final revision. Reviewed implementation/fix head: `3adc5b9`; subsequent changes record evidence only. This progress update creates a new checked head; do not reuse earlier CI. Actual merge remains pending. No IOS2 implementation, production build, push setup or store submission has started.

## IOS2 — Native identity, session lock and household onboarding

Predecessor IOS1 [PR #36](https://github.com/FSS-Ltd/the-joint-app/pull/36) is host-verified merged at `974208e118478ce41bd82b85e05c77eff5eee2ef` on 2 November 2026. Final head `c154cd669e602c80e53fb30b912f6982275d4eba` and checked test merge `cf562c885f3fabab28801f99393aee96c4314ff4` passed [CI run 41538262010](https://github.com/FSS-Ltd/the-joint-app/actions/runs/41538262010). Foundation checks passed formatting/lint, builds, types, 407 unit tests, 322 database integrations and 181 browser tests. Native bundle checks passed frozen install, native types, dependency checks, Expo Doctor (20/20) and both platform exports. All applicable steps succeeded. Checkout logs in both jobs identify the same tested merge; its parents match the final base/head.

Fresh host checks found no required approvals or unresolved review threads. Normal protected merge used standing founder authority with an exact-head condition; no bypass or self-approval. This supersedes historical pending IOS1 entries. IOS1 source delivery is complete; its recorded Android runtime, full screen-reader, signed-binary and dependency-audit limitations remain future verification/maintenance work, not silently waived.

Current branch: build/ios2-native-identity, based on the verified IOS1 merge. State: entry investigation and interface planning. Agents Orchestrator is reviewing existing Clerk/session and household seams read-only. Current scope remains iOS first with functional Android support. No IOS3 work, deployment, push provisioning or store submission. Next action: define the bounded native identity implementation brief using existing contracts, then implement and independently review IOS2 before its PR.

IOS2 server checkpoint: the Identity & Access Engineer implemented an opt-in API-purpose session profile. Signature/issuer/time verification precedes strict profile selection; present malformed/foreign `azp` never falls back. Exact signed audience and purpose are required for configured origin-less API sessions. Existing provider, registry, MFA, idle and tenant authority remains. Schema/type names preserve the established web claims type and separate common session facts. No provider setting, migration or live account was changed. Design: [IOS2 identity](decisions/ios2-native-identity.md).

Verification so far: full unit run passed 457 cases across 68 files; after a type-only naming correction, 92 focused cases and contracts/API/test-source types passed. Contracts/API builds, targeted lint/format and diff checks pass. An owned disposable PostgreSQL run passed 35 cases across five suites (API bearer, Clerk session/identity, session idle and households). Three legacy HTTP-auth cases failed before behavior execution because the PostgreSQL-only runner lacks loopback `SUPABASE_AUTH_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_TEST_ADMIN_KEY` fixtures. This is not a wholly green six-suite run. No assertion or timeout was weakened; full isolated legacy auth verification remains required. The runner verified its ownership label/name before removing its container, anonymous volume and scratch directory.

IOS2 native implementation is now assigned to the Mobile App Builder profile, with mobile/runtime/UI ownership and justified shared pure auth/idle reuse across web and native. Backend and parent documentation ownership remain separate. It is in progress, not verified complete. Actual Native API status, audience/claim configuration, registered return identities and real provider/device evidence remain unverified inputs; prepare reviewable source/setup guidance before any required configuration approval. IOS2 has no PR yet. Independent whole-branch Code Reviewer and Application Security Engineer reviews, final local/CI checks and verified merge remain mandatory before IOS3.

IOS2 verification update: the parent extended only its ignored, ownership-checked
runner to provision a disposable loopback Auth gateway, provider database and
synthetic Mailpit inbox using existing pinned images and fresh scratch keys.
The same six integration suites then passed **38/38 tests across 6/6 files**,
including all three legacy HTTP-auth cases. This supersedes the earlier missing
fixture result; no assertion, deadline or production source was weakened.
Cleanup independently found zero owned app/auth containers, auth volumes or
scratch directories. Personal databases, private auth settings and unrelated
services were not read or changed. Retained evidence is the ignored
`ios2-server-integration-auth.log`.

A read-only public Clerk environment probe returned HTTP 200 without a Native
API disabled error. This does not establish successful signed-session admission;
the server API bearer audience remains unset. No provider setting changed.
CUA inspected the configured iOS Expo Go password sign-in/signup forms, empty
email validation, password visibility and navigation without submitting real
credentials. Parent feedback improved action hierarchy, field boundaries and
error announcements. The loopback UI probe returns only 503 and provides no
authentication authority. Real signed-session, TOTP, household and registered
return acceptance, Android runtime and complete screen-reader checks remain
unverified. IOS2 remains current, with no PR or next-unit implementation yet.

IOS2 independent review at `6cc2c9b`: Code Reviewer requested five corrections:
verification/recovery resumption, pending authenticator enrollment, terminal
cleanup-ticket recovery, late async background concealment and stale-session SDK
sign-out isolation. Application Security Engineer independently confirmed cleanup
expiry and additionally found a terminal-invalid-credential local-removal gap.
Both reviewers passed 131 focused cases, but source-executing deferred-response
probes reproduced lifecycle defects those pure tests missed. No new credential,
MFA or tenant authorization bypass was confirmed; this is not approval.
The Mobile App Builder is implementing correction round 1 with behavior-focused
regressions; reviewers must independently recheck before PR creation. The fresh
audit retains the four previously recorded advisory identities and is not clean.
Real-provider/device acceptance remains open. IOS3 has not started.

IOS2 correction round 1 checkpoint (3 November): minimal non-secret workflow
progress now survives concealment without implicit email sends. Shared pure
stage selectors avoid duplicating provider mappings. Sensitive fields still
unmount. Ordinary refresh cannot enable foreground state; deferred operations
check lifecycle/actor scope, and SDK cleanup checks the original current session
and its existence. Cleanup capabilities are queued, terminal rejection retires
only the affected capability after durable persistence, and explicit local
credential removal does not claim server/global logout.

Source-executing regressions replayed against `6cc2c9b` fail 10 of 11 targeted
cases; corrected lifecycle cases pass 26/26. Full units pass 507/507, focused
native/shared cases 65/65, types 19/19 tasks plus tests, builds 9/9, lint and
formatting pass. Both native exports and Doctor 20/20 pass. These do not replace
real-provider/device evidence. Parent is freezing the corrected revision for
independent code/security re-review. No PR yet and no IOS3 work.

IOS2 round 1 re-review at `1a69ec5` resolved the original code R1–R4 and
security SEC-1. Actual installed Clerk 6.42.1 probes found remaining SDK-boundary
defects that the earlier doubles omitted: throwing from finalization navigation
can leave SDK state undefined; broad sign-out can remove a replacement session
after its internal await; terminal SDK token-acquisition errors are still hidden
as generic unavailability. Passing 507 unit tests does not clear these findings.

Round 2 is authorized within IOS2 only. Use supported captured-session removal,
a runtime-owned mutation coordinator spanning actual SDK completion, synchronous
SDK resource observations and continuous app concealment. SDK selection cannot
be atomically cancelled through its public API; conflicting/ambiguous state must
settle safely or remain concealed for explicit selection. Normalize only
recognized terminal authentication errors; preserve transient failures. Actual
installed-SDK deferred tests, followed by both independent reviewers, are required
before PR creation. No provider settings, deployment or next delivery unit.

IOS2 round 2 checkpoint: supported captured SessionResource.remove replaces
broad SDK sign-out. Runtime coordination holds through actual SDK completion,
blocks all identity reads during mutation/loading/quarantine, preserves observed
conflicts and offers explicit bounded selection recovery. No throwing navigation
cancellation, private SDK patch, automatic rollback loop or timeout unlock.
Recognized terminal Clerk token errors preserve their expired-credential outcome;
transient failures remain unconfirmed.

The installed native SDK now executes against synthetic environment/client
responses with every fetch trapped. Deferred tests cover replacement actors,
captured removal, failed/missing targets, loading, background, an unfinished
operation past timeout and a normal 60-second browser return. These are not live
provider/device flows. Full units pass 528/528 across 77 files, types 19/19 plus
tests, lint/format, builds 9/9, both native exports and Doctor 20/20 pass. Parent
is freezing this revision for both independent retests; no PR or IOS3 yet.

IOS2 draft [PR #37](https://github.com/FSS-Ltd/the-joint-app/pull/37) is open.
Published/reviewed source head: 1e44e8ee59aef2cdd88f1c3d9d67fc83b80ccd6f.
Both required profiles completed review before publication. Original critical
SDK transition/removal defects are corrected, but code C3/C4 and security SEC2
leave three P2 recovery corrections: start-over must reset completed attempts;
A → B → A must preserve the latest changed selection; recognized structured
session_not_found 404 must expose terminal credential recovery. Actual installed
SDK probes reproduce each. Independent full 528 tests and 178 focused security
tests pass; they do not clear the findings. PR is deliberately draft, not approved
or merged. Latest applicable cloud CI must still be verified.

Round 3 will fix only these current-unit recovery findings and obtain both
independent retests. Provider audience/customization and configured native
runtime acceptance remain open; Android exports are not Android runtime proof.
No IOS3, personal database change, deployment, push provisioning or store review.

IOS2 round 3 local checkpoint: fresh restart resets both SDK attempts through
maintained hooks before abandoning workflow and clearing selection; failed reset
stays concealed. Defined actor changes back to the original actor are retained,
while known late SDK completion remains excluded. Only recognized structured
session_not_found 404 joins terminal token recovery; unrelated 404 and transient
errors retain unconfirmed handling.

Three first-red installed-SDK cases were preserved before the narrow fixes.
Full units pass 536/536 across 78 files; types 19/19 plus tests, lint/format,
builds 9/9, both exports, Doctor 20/20 and diff checks pass. Parent is committing
for both independent retests before pushing the correction to Draft PR #37.
Cloud run 41555212015 checks the earlier documentation head 0ad9b34: native
bundle checks succeeded and Foundation remained pending at last observation.
Older run 41555142105 was requested cancelled because its head was superseded;
it is not current-revision acceptance evidence. No merge or IOS3.

IOS2 round 3 independent retests at c176a8d5e40a6c365c2ad64088f55c3bfd2e46c7
clear code C3/C4 and security SEC1/SEC2/SEC3 within source/installed-SDK evidence.
Code Reviewer passed 56 focused tests, mobile types and diff checks; Application
Security Engineer passed 186 tests plus both corrected original probes, scoped
secret/diff/report checks. No additional actionable source finding. This is
source readiness to update Draft PR #37, not runtime/merge approval.

Earlier head 0ad9b348ea8c38b2b5bd6f59c83c96a4b0d26359 passed both applicable
jobs in [CI run 41555212015](https://github.com/FSS-Ltd/the-joint-app/actions/runs/41555212015):
528 unit, 324 integration and 181 browser cases, both exports and Doctor.
Both jobs checked merge 02200b0711ff991683e8ae5ad3f6982302ffa39e, whose parents
are base 974208e and that exact PR head. This is baseline evidence only; the
reviewed correction and this evidence update require fresh current-head CI.
No merge is authorized by these results. Live configured native identity
acceptance and previously disclosed device/configuration limits remain open.

IOS2 visual correction — 3 November 2026: the founder rejected the native
composition's drift from the approved Stitch wireframes. Agents Orchestrator
compared the actual setup/home snapshots and contract; Mobile App Builder is
refining shared presentation within Draft PR #37. Preserve the approved mark,
compact header, restrained backdrop, single highlighted light panel and small
rectangular controls. The UI8 contract supersedes the snapshots' doubled frames.
Auth coordination and server authority remain unchanged. Parent native inspection,
fresh code/security reviews, local checks and current-head CI must precede
delivery evidence. No IOS3 work.

The founder separately approved development-only Clerk session claims
`aud: "familyfund-api"` and `joint_token_use: "api-session-v1"`, preserving
existing fields and stopping on an audience conflict, with the matching private
audience only in the owned test API. This approval supersedes the earlier
approval blocker. No provider setting or live acceptance result is claimed here;
visual refinement is the current priority.

Host refresh confirms IOS1 PR #36 merged at
`974208e118478ce41bd82b85e05c77eff5eee2ef`, with final-head CI run
`41538262010` successful. PR #37 remains open/draft/unmerged at
`ad3966aab3007263cb0c63cce148d748d03bcbd2` before these visual edits. Earlier
green CI is not proof of the new visual revision.

IOS2 visual correction locally verified: shared components now use the compact
approved wordmark, static sage/apricot backdrop, one highlighted ivory panel,
16px body copy and rectangular actions. Native fields use an RN outline around
the universal input to avoid clipped SwiftUI stroke corners. Secondary actions
use the home reference's quiet sage fill; nested percentage wrappers were rejected
after actual iOS inspection showed intrinsic-width buttons. iOS fixed native fonts
now scale explicitly, while Compose retains its own sp scaling. Password controls
stack for narrow/enlarged layouts. Minimum target padding remains inside each
painted semantic label, including text actions and reduced preferred text sizes.

Parent CUA inspection on the named iOS 26.3 "Flamingo Mama Storage Smoke"
runtime covered blank sign-in, signup and recovery, local validation, clean field
outlines/focus, full-width actions, password toggle top/bottom padding, primary
and secondary perimeter taps, and text-action outer padding. Three preferred
text-size increases showed readable scaled copy and stacked password controls;
all three increments were restored. Native password focus moved the lower field
into view; a background gesture dismissed the software keyboard. Manual scrolling
with the keyboard held open was not established through the automation. No
credentials, codes or provider actions were submitted in these visual checks.
Blank final screenshot is retained in ignored local review evidence.

Code Reviewer and Application Security Engineer cleared the final source before
PR update. Review found an undersized target at small preferred text sizes;
the corrected padding guarantees at least 48pt before additional line-box height,
without capping text or fixing button height. Both profiles independently retested
the final action correction with no remaining material finding. Parent reopened
all eleven changed/new files. Full local units pass 539/539 across 79 files;
root types 19/19 plus tests, lint, formatting, build 9/9, both iOS/Android exports
and diff checks pass. Three new metrics cases cover default sizing, uncapped iOS
scaling and Android avoiding double scaling. No new dependency or migration.

Limits remain: no exact 320px native runtime, maximum accessibility size, full
VoiceOver/TalkBack, Android device runtime, household/verification live-provider
flow or signed binary/store verification. This is a visual revision of IOS2,
not completion or merge. PR #37 must remain draft until applicable configured
identity acceptance is resolved; its new revision needs fresh CI. No IOS3 work.

IOS2 configured acceptance checkpoint after visual head `6595249`: both
Foundation and Native bundle jobs passed [CI41598388517](https://github.com/FSS-Ltd/the-joint-app/actions/runs/41598388517).
Checkout logs identify tested merge `1dd54279380e59d5dc2a4a7abca7178db229ffe9`
of that head into base `974208e118478ce41bd82b85e05c77eff5eee2ef`. Results:
539 unit, 324 integration, 181 browser tests, both exports and Doctor20/20.
PR #37 remains draft/unmerged; these checks precede the invitation correction.

Applied only the explicitly approved development Clerk custom claims, preserving
the previous empty custom object and all other session settings. Matched Family
Fund Development's domain to the native public issuer before save. Native API
was already enabled; no toggle, app identity, return URL or production change.
The security-reviewed owned API fixture started with fresh restricted PostgreSQL,
status LISTEN/health readiness and anonymous `/v1/me` denial (401). Only its
matching private API audience is enabled. Root private configuration is read
selectively in memory, never changed or bundled; public mobile preview origin
was updated and the owned Metro/app reloaded. No personal database was used.

The user initially reported another sign-in failure, then confirmed correct
credentials work and the earlier password was wrong. Parent observed the native
account/household screen after this confirmation, without exposing credentials,
codes or setup keys. This establishes signed identity/account access through the
configured fixture; enrollment, returns, invitation acceptance, logout and the
remaining device matrix are not all individually verified by that observation.

The user then found that inviting another adult had no deferral action. Current
IOS2 correction: default invitation to a collapsed account action, add explicit
“Invite later,” preserve later access and pending/permission boundaries. This is
the existing optional-invitation requirement, not IOS3. Add failing behavior
regressions, verify the native result, obtain fresh code/security reviews and
current-head CI before updating/merging PR #37. Source delivery remains open.

IOS2 invitation correction native acceptance passed on the configured signed
household: default collapsed with no email field, open reveals the form and
“Invite later,” deferral returns to the ready household and account action,
reopening works, and parent left it closed. No invitation was submitted by these
checks. Four source-executing UI cases cover default optional state, no-invitation-
write deferral/reopening, a pending write guard and hidden/reopened existing link,
plus organiser/full-household boundaries. First-red reproduced three missing
action cases; all four pass after the focused fix.

The earlier wrong-password attempt also exposed a feedback defect: the real
installed native SDK returns an `api_response_error` container whose nested code
was ignored by the existing mapper. Independent synthetic SDK probe reproduced
this without real credentials/provider calls. Two committed SDK regressions
failed first for incorrect password/missing identifier, then passed after one-level
normalization through the existing fixed message allowlist. Direct codes retain
their behavior; unknown/malformed details remain generic with no provider-text
reflection. This changes feedback only and grants no authentication authority.
Fresh independent code/security reviews and final local/cloud checks are running.

IOS2 final local checkpoint for invitation/feedback correction: Code Reviewer
and Application Security Engineer both pass the final source before PR update.
Independent results include 14 focused plus the original SDK probe, and 52
security-focused cases respectively, mobile/shared/test types, scoped lint,
formatting and diff/secret checks. Parent reopened every changed/new file and
passed 546 units across 81 files, root types 19/19 plus tests, lint/format,
build 9/9 and both iOS/Android exports. The new revision requires fresh cloud CI.

Acceptance audit retains the current gate: configured email/recovery return,
authenticator enrollment/return and separate fresh server TOTP, deliberate
two-adult invitation/share/accept, signed background/foreground and local/global
logout evidence remain to record. Disabled optional Google OAuth is not an
active return flow. Invitation custom-scheme acceptance still needs a registered
native installation; Expo Go alone cannot prove it. No development bundle ID is
specified in app.json, so do not invent a production/Clerk identity. Confirm
disposable test-account scope before revoking other provider sessions. Corrected
the IOS2 decision's stale physical-device/release reference to IOS18; IOS16 is
marketing/web cutover. Keep PR #37 draft until applicable acceptance passes.

IOS2 invitation/feedback head `757e4718200a76a858f9d995efe45cf82a311fa7`
passed both Foundation and Native bundle jobs in
[CI41604397577](https://github.com/FSS-Ltd/the-joint-app/actions/runs/41604397577).
Both checkout logs identify merge `cfe1cde6d8e7ea7f27ce9811e98600c747aa2e6a`
into base `974208e118478ce41bd82b85e05c77eff5eee2ef`: 546 units, 324
integrations, 181 browser tests, both exports and Doctor20/20. Host still reports
PR #37 draft and unmerged. This is baseline evidence for the following fix.

The founder approved using the current development account for local/global
logout and creating/removing one disposable second adult for enrollment and
invitation tests. No second adult has yet been created. Approved global logout
concealed account/household access, but cleanup stayed pending after one explicit
retry. A read-only provider check found zero active sessions. The strict parser
expected an envelope while Clerk's default sessions response is an array.
Requesting `paginated=true` matches the existing schema and the installed backend
SDK. Preserve subject, creation-cutoff, bounded pagination and confirmation guards.
Two regressions failed before the fix; 17 focused logout cases pass afterward.
A second read-only provider check accepted the paginated envelope with zero active
sessions and no provider writes. The already-running fixture still holds the old
code; this does not establish native cleanup recovery. Do not retire its pending
ticket or report successful global cleanup merely from the provider session count.

Local follow-up checks: 547 units/81 files, types 19/19 plus test types, lint,
formatting and build 9/9 pass. Three affected identity/session integration files
pass 33/33 in a fresh owned database; its verified container and anonymous volumes
were removed. Code Reviewer and Application Security Engineer independently clear
the source/test correction: 17 focused cases plus pagination/cutoff/isolation
probes, API/test types, lint/format and diff checks. Fresh revision CI remains
required before this fix can satisfy the delivery gate.

The founder has no existing development bundle ID. An isolated managed checkout
at `757e471` uses temporary `com.example.familyfund.dev` only for unsigned local
simulator acceptance; no Apple/Clerk registration or production identity changed.
Frozen install, shared builds, iOS prebuild and 113 pods passed. Xcode 26.3 failed
before app compilation in ExpoModulesJSI (`sending 'slot' risks causing data
races`), exit 65. No installable binary, install or native invitation return was
produced. [Expo SDK58 requires Xcode26.4+](https://docs.expo.dev/versions/v58.0.0/).
[Apple lists Xcode26.4.1 as compatible with macOS26.2](https://developer.apple.com/xcode/system-requirements/).
Official download sign-in is prepared in the in-app browser. Keep the existing
toolchain and generated checkout intact while the supported rebuild is pending;
no vendor patch, concurrency weakening, EAS or store submission. IOS2 remains
current; IOS3 has not started.

### IOS2 merged baseline and IOS2.1 authenticator setup

Host revalidated [PR37](https://github.com/FSS-Ltd/the-joint-app/pull/37) as
merged into main at `099f3ce2820a3fa6d952e566ae8eaf3a2ccc3ccb` on
2026-11-03. Reviewed head was `8dfb550b5486b2fb889d1e9eb3b8d3388fa8b807`;
its tree equals the actual merge. PR CI41610480514 and main CI41618624503
succeeded. The PR checks tested merge `f14f91922a02b16897522b2ac6c3b5b512f982eb`:
547 units, 324 integrations, 181 browser tests, both native exports and Doctor20/20.

Configured native acceptance progressed after the founder updated Xcode to26.6.
The local iOS build and Android Debug build succeeded with temporary local-only
identifiers. The initial unsigned iOS packaging failed SecureStore startup;
normal simulator ad-hoc signing restored startup without a developer account or
manual entitlement changes. Native sign-in, optional invite deferral/reopening,
signed background return and fresh global logout passed. Provider read-only
confirmation found zero active sessions after that fresh logout. This does not
recover or retire the earlier runtime's pending cleanup ticket.

One approved disposable adult signed in with development email verification.
The founder reported authenticator setup, background clearing of key/code, and
separate fresh session verification passed. A subsequent local logout settled at
Welcome home with no pending cleanup. Deliberate invitation acceptance, remaining
return/device checks and final disposable-fixture cleanup remain outstanding.
Actual financial access and later delivery phases are not certified by these
observations. IOS3 has not started.

The founder requested easier authenticator setup. IOS2.1 is a focused follow-up
on the verified merged baseline: local QR, explicit authenticator-app opening,
and hidden manual-key fallback. See [design](decisions/ios2-authenticator-setup.md)
and [implementation plan](superpowers/plans/2026-11-03-authenticator-setup.md).
[PR38](https://github.com/FSS-Ltd/the-joint-app/pull/38) is open from
`build/ios2-authenticator-setup` against main. Source revision
`3ad81255ecea295d8db6cae24aeebb94026c8f91` passed the local checks below.
Current branch-head CI must pass before merge; no merge is claimed.
Code Reviewer and Application Security Engineer independently found no blocking
source issue and each passed 49 focused tests. Local verification passed 591
units across 84 files, root types/lint/format/build, Doctor 20/20, dependency
alignment and both standard-entry exports. Xcode 26.6 native compilation and
strict simulator signing verification passed. A public sample of the actual
component rendered under Hermes; Apple Vision decoded its QR to the exact
expected URI. Explicit opening reached iOS Passwords, and manual reveal/hide
passed. No sample credential was saved. The temporary preview entry was restored
and the normal configured native sign-in screen is ready. Android Debug native compilation, SVG autolink/codegen packaging and APK
signature verification also passed. Physical-device scan/enrollment, Android
runtime and expanded accessibility/device coverage remain unverified here.
Current-revision CI remains required. The dependency audit reports three
existing baseline advisories (multer high; minimatch/glob moderate), with none
reported for the newly added QR/SVG graph. Do not describe the full audit as green.

### IOS2 configured runtime acceptance — current evidence

Host revalidated [PR38](https://github.com/FSS-Ltd/the-joint-app/pull/38)
as merged at `84da2976d9246204559d81d1af74176c7cc80583`. Reviewed head
`971f195078b1c95c89336a1f442c03fc2bf38c74`, PR CI41632854737 and main
CI41648118830 have successful Foundation checks and Native bundle checks.
The preceding PR38-open status is historical. Its implementation checklist is
complete; IOS2 runtime acceptance remains incomplete.

The [runtime acceptance record](joint-app/ios2-native-runtime-acceptance.md)
separates source/CI verification, founder-reported actions, native observations,
integration coverage and unavailable checks. New iOS evidence confirms fresh
household TOTP proof, registered warm/cold invitation prompts, one deliberate
acceptance and the intended two-adult ADMIN/MEMBER household. Android evidence
now includes fresh sign-in, the shared household, signed background/foreground
return, local logout, on-screen synthetic input and registered warm/cold links
that preserved the expired-session gate.

Final Android manual logout, enlarged text and TalkBack results remain pending
because automation cannot reliably click the available viewer. Reviewed cleanup
also remains open. Historical unknown-key cleanup tickets and wider physical
storage/accessibility/store limits are preserved explicitly. No production
identity, store submission, new product code or IOS3 work is included. This
current-unit documentation update must receive both independent reviews and its
own current-head CI/merge before any later delivery step.

### IOS2 PR39 native CI compatibility correction — 4 November 2026

[Draft PR39](https://github.com/FSS-Ltd/the-joint-app/pull/39) remains on current
IOS2. At revision `924c6de33bb390f615ab1a0a10b954e16580d6a3`, Foundation checks
succeeded but Native bundle checks failed in CI41740324178. The failure reproduced
locally: Expo's online compatibility recommendations advanced eight SDK58 package
versions after the earlier passing baseline. The candidate updates exactly those
eight pins and the lockfile; the online dependency check and Doctor remain intact.
No exclusions, offline override or CI waiver is introduced.

The [acceptance record](joint-app/ios2-native-runtime-acceptance.md) lists the
precise versions and separates baseline device observations from candidate checks.
Frozen install, online alignment, Doctor20/20, root types, 591 units/84 files,
lint and formatting pass locally; the root production build passes with cached
outputs. Both standard-entry native exports, local native rebuilds and artifact
inspections pass. Focused aligned-binary startup/form results and cleanup are
recorded below; final current-diff reviews and new-revision CI remain required.
No refreshed binary was installed while the manual walkthrough was pending.
This is a correction within PR39, not a new phase or IOS3 implementation.

### IOS2 PR39 manual report and native rebuild checkpoint — 4 November 2026

The founder reported that the final Android local-logout, enlarged-text and
TalkBack walkthrough passed, with settings restored. This supersedes the earlier
pending-manual-result status. It is a user report on the original runtime binary,
not an automated accessibility certification or an aligned-binary startup result.
No repeat sign-in, factor enrollment, Copy or invitation acceptance is required.

Both aligned native rebuilds and actual artifact inspections pass. Android has
its normal Debug signature, expected ABI/SDK, unchanged eight permissions and
safe-area/SVG codegen. iOS has both simulator architectures and strict ad-hoc
signature verification without a developer identity or provisioning profile.
Temporary native identifiers were restored byte-for-byte before handoff. The
three existing dependency advisories remain disclosed; no clean-audit claim is
made. Final independent reviews and fresh current-revision CI remain required.

The user asked to finish and merge PR39 in this chat and hand the remaining app
work to a new chat. This does not mark IOS2 or the full app complete before its
remaining evidence and actual merge are verified, and no IOS3 work starts here.

### IOS2 PR39 aligned startup and scoped cleanup — 4 November 2026

The parent installed and inspected both rebuilt aligned binaries using the
candidate's standard-entry JavaScript. iOS reached the empty styled Welcome home
form. Android reached its expired-session gate with household content concealed;
local sign-out then settled to the empty form with its expected fields/actions.
The initial Android resume encountered an OS-level ANR before JavaScript, then
startup passed after reducing host contention and restarting the same AVD without
a wipe. These are focused aligned-binary observations; earlier signed flows and
the founder-reported manual walkthrough retain their original-binary scope.

The frozen exact-owner disposable-adult CLI cleanup and subsequent status check
both reported deleted, with the null-password tombstone retained. The parent
verified and removed only the matched device reverse mappings, stopped the owned
Android guest and durable API launcher gracefully, confirmed the runner claim
absent, stopped owned Metro/viewer processes and checked the relevant listeners
were absent. The iOS simulator was shut down after inspection. The consumed
owner-checked invitation capability file was retired without disclosure.
No unrelated IDE project or original development account was removed.

The same durable database/private journal are intentionally retained for handoff
and reconciliation, not claimed purged. Historical unknown-key fixtures/tickets,
native artifacts and active checkouts remain preserved for safe follow-up. A
future permanent disposal requires its own concrete reviewed ownership checks.
Current runtime checks and scoped cleanup are recorded; PR39 still requires both
final independent reviews, successful latest-revision/required merge CI and an
actual merge. The full app remains unfinished, and no IOS3 work starts here.

## NAV1 — Canonical feature tree and Graphify baseline — 4 November 2026

Predecessor [PR39](https://github.com/FSS-Ltd/the-joint-app/pull/39) is
host-confirmed merged into main at `5e5a63b1aec322fa06f47b31cbf01ca371c37b50`.
Reviewed source `d795f09d1b8d663ed342e79ec9b44a3e2af01e0e` passed PR
CI41777899568. Post-merge [CI41779002327](https://github.com/FSS-Ltd/the-joint-app/actions/runs/41779002327)
finished successfully on the exact merged SHA: Foundation126405968258 and
Native126405967941 both succeeded. Both job checkout logs identify that SHA.
These host results supersede historical PR39-open statements above; recorded
native/provider/device limitations and retained private evidence remain intact.

The founder added a mandatory Graphify and persistent feature-tree policy.
No equivalent project-wide tree existed in the verified base. NAV1 is a
standalone prerequisite documentation unit on `build/nav1-feature-navigation`,
not IOS3 implementation. See [plan](superpowers/plans/2026-11-04-feature-navigation-baseline.md)
and [canonical tree](../FEATURE_TREE.md).

The baseline inventories 45 stable feature IDs across identity/native, finance,
platform/privacy/operations and planned/deferred scope. Entries link canonical
source symbols, tests, permission boundaries and reciprocal directed dependency
and consumer references. Implemented status describes the exact source scope,
not production readiness. Existing backend/web features are distinguished from
planned native finance, projection engine, billing, companion and release work.

Installed Graphify produced six bounded AST scopes covering 477 detected runtime
files, with four sensitive-file exclusions, plus a feature graph with 276 nodes
and 470 directed edges. The local project-wide index records source revision and content
hashes. Generated outputs remain ignored; the tracked navigation guide records
rebuild/refresh procedure, incomplete test/model/config/document extraction and
AST ambiguity. No private journals, credentials, real financial data, provider
identities or native acceptance artifacts entered extraction. Earlier chats are
not claimed updated. No watchers, hooks, polling or external upload was added.

Reuse decision: preserve canonical identity, financial services, shared Zod
contracts, exact money, scoped database and event/worker boundaries. The mapping
adds no parallel product implementation, dependency, migration or runtime change.
Local validation checks all feature IDs, source/test paths, named symbols, Markdown
links/anchors, reciprocal dependencies and graph/source content hashes. Formatting
and diff checks are required alongside independent final Code Reviewer and
Application Security Engineer reviews before publication. Runtime suites are not
rerun locally for this documentation-only unit; existing full CI remains required.
The unchanged AGENTS.md link to RULES_RESEARCH.md is an existing missing-file gap,
separate from the validated navigation links added here.
The first independent code/document review identified two missing reuse
relationships. The corrected tree retains both IMPORTS/EVENTS directions for
distinct UI subscription and server status-read roles, and records IOS10a's
planned reuse of FUNDING, ALLOCATIONS, CONTRIBUTIONS and PROJECTIONS. Existing
implementation statuses are unchanged. The guide also records how to reconstruct
the ignored feature graph/index from the tracked domain documents. These fixes
still require final independent re-review before publication.
PR publication, current-revision CI and actual merge are not yet claimed here.
No IOS3 implementation or scaffold has started; NAV1 must merge before IOS3.

NAV1 publication: [PR40](https://github.com/FSS-Ltd/the-joint-app/pull/40) is open
against main from `build/nav1-feature-navigation`. Both independent final profiles
cleared source `6201d503c5eb277461365b24fc96ddf21bc9d252` after the relationship
corrections. Code review marked both P2 findings addressed; security found no
remaining publication blocker. Local validation passed 45 feature IDs, 368
source/test references, 214 symbols, 481 runtime hashes, directed graph/tree
reconstruction, formatting and diff checks. Tests listed by the inventory remain
source references; runtime suites were not rerun locally for this docs-only unit.

The connector returned integration 403 for PR creation; the authenticated CLI
created the authorized PR and it is attached to the current chat. Initial
[CI41782828337](https://github.com/FSS-Ltd/the-joint-app/actions/runs/41782828337)
was running Foundation checks and Native bundle checks at publication. This
publication-evidence update requires current-revision CI again. No NAV1 CI
success or merge is claimed; verify final head/test-merge checks and host merge
before IOS3. Retained local graphs and review evidence remain needed for ongoing
work, so the active worktree is preserved.

## IOS3 — Native API and committed updates: entry checkpoint

Predecessor [NAV1 PR40](https://github.com/FSS-Ltd/the-joint-app/pull/40) is
host-confirmed merged into main at `5077bd019ea05fc01693af06617c0f9d04dee601`
on 4 November 2026. Final reviewed head
`13636ecf37a1911d7906e745bd45587cae9aad0a` passed
[CI41783057579](https://github.com/FSS-Ltd/the-joint-app/actions/runs/41783057579):
Foundation126418824920 and Native126418825191 both succeeded. Both checkout
logs prove test merge `16da011788fa9c8969bac51ccc14ca91ceeb91c5` of the exact
head into base `5e5a63b1aec322fa06f47b31cbf01ca371c37b50`. Results: 591 units,
324 integrations, 181 browser tests, online Expo checks/Doctor20/20 and both
native exports. Source, tested and actual merge trees are identical:
`d5f7db12d7cf3f524911e7da9e2811e29d4ac437`. Live host reported CLEAN, no
unresolved threads and zero required approvals. Protected normal merge used
standing authority and an exact-head guard; no bypass or self-approval.

The current worktree retains its needed ignored Graphify/review artifacts and is
now on `build/ios3-native-api` at that verified merged base. The canonical feature
tree and relevant Graphify nodes were read before interface decisions; source
hashes and unchanged map coverage were reconciled. The Agents Orchestrator is
performing a bounded read-only architecture/reuse audit. Frozen dependency
installation passed under Node22.23.3; baseline build/tests and the exact IOS3
file/interface brief are next. No product implementation has started here.

Post-merge main [CI41784465145](https://github.com/FSS-Ltd/the-joint-app/actions/runs/41784465145)
was running at entry and is not claimed successful. The required PR/current-head,
test-merge and actual-merge delivery gate is satisfied. The full app remains
unfinished. IOS4 cannot begin before IOS3's own review, current CI and merge.
Private fixtures, historical tickets, provider accounts and both acceptance
worktrees remain preserved; no real-provider handoff was repeated.

IOS3 Task 1 source is committed locally at `58a8b81ec6d93f7befd23bb9ba9252503ec8a9ef`: account detail/page status selectors reuse AccountQueries projections and the pure decoder is canonical in contracts with web compatibility. Worker verification records 595 unit tests, package/test types, scoped lint/format and builds passing. Database integration and independent task acceptance remain pending; no IOS3 PR, merge or next internal task is claimed.

Map reconciliation at that revision rebuilt API, shared and web-component scopes, removing moved decoder relationships from the web graph. Mobile, web routes and operations were content-hash verified unchanged. Six scopes cover 478 detected runtime files; four sensitive-file exclusions remain. Canonical feature entries now describe account observations, cursor-stable page fingerprints, decoder reuse and the partial NATIVE_API foundation. Existing source-backed feature IDs remain stable. Validation passed for 46 features, 250 canonical references, all 482 runtime hashes, graph endpoints, reciprocal dependencies, feature-document hashes and Markdown paths/anchors. Queries confirm AccountQueries.observePage and the decoder's contracts location; the stale web implementation node is absent. Formatting and diff checks pass.

The disposable database runner remains unlaunched. Independent code/security reviews found descendant cleanup, uncertain Docker creation and an omitted mode-specific ambient environment guard. These must be fixed and re-reviewed before synthetic database verification. No retained acceptance data or real provider identity is involved.

Live resumption check reconfirmed PR40 MERGED at `5077bd019ea05fc01693af06617c0f9d04dee601`; post-merge main CI41784465145 is completed SUCCESS on that exact revision. This supersedes the historical running-state note at entry.

IOS3 Task 1 independent spec/source review passed with no code findings. The disposable fixture fix passed both exact-hash code and security re-reviews; 53 pure regressions and nine-module syntax/lint/format checks passed. First synthetic PostgreSQL execution passed all 19 cases across account-status (7), status-notifications (3) and status-transport (9), using only generated fixture identities and restricted runtime credentials. No real provider flow or retained data was accessed.

The original run reported settled creation and verified owned process cleanup, but its immediate container-absence check returned false. A subsequent successful exact full-ID inventory verified that the captured container was absent; original results remain preserved beside the follow-up evidence. A bounded auto-remove completion fix then passed RED/GREEN checks and both scoped reviews. Two fresh executions each passed 19/19 with settled creation, verified owned processes and verified automatic container cleanup. Tracing attempts did not identify the pg warning caller; the accepted Minor and its attribution limit are recorded below. IOS3 is unmerged and IOS4 remains gated.

The founder reiterated event-driven, battery-conscious updates. Current mapped runtime audit found no recurring database/API refresh interval in mobile, web components, API, worker or shared identity runtime. Native Clerk explicitly disables polling and native client sync. The API's 15-second SSE keepalive only writes an empty frame; it does not read resource state. Database LISTEN/NOTIFY, scoped observer fingerprints and serialized pending wakes deliver committed changes; unchanged/rollback/cross-tenant state does not trigger a resource-change frame. Worker timers schedule due work/retry, session timers cover actual input/expiry, and the resend interval is a local countdown. This source audit does not claim native resource lifecycle is already implemented. IOS3 Task 3 must prove idle request/read counts, keepalive silence, background connection teardown, duplicate coalescing and foreground/reconnect catch-up before delivery.

Task 1 acceptance is independently approved; internal Task 2 may proceed. Open Minor `IOS3-M1`: the passing account suite emits pg concurrent-query deprecation under pinned pg 8.23.1. Installed driver still queues that work; exact caller remains unconfirmed. Existing Prisma relation loading is a source-backed hypothesis, not proven attribution. Carry the warning and trace limitation into both final whole-branch reviews and resolve/account for compatibility before a pg 9 upgrade. No production serialization, dependency change or warning suppression was introduced.

Focused event/idle verification passed 31 tests in six files: status-subscription, status-client-stream, status-stream, worker-scheduler, database-notifications and session-idle-controller. These cover existing event/idle boundaries; they do not substitute for the pending native transport/lifecycle and simulator evidence. Both maps retain source-backed statuses and the IOS3 plan now makes battery-conscious idle/background acceptance explicit.

IOS3 internal Task 2 is now implementing the common native transport and typed account adapter from locally verified checkpoint `39c57d430078841399f2ba1c9ac27e459d98a842`. It must remain on-demand, preserve identity/cleanup behavior and use the existing Expo networking dependency. Resource lifecycle and simulator idle/background acceptance remain the subsequent internal Task 3 within this same IOS3 PR unit. No IOS4 work, push, PR or final merge is claimed.

The founder requested minimal IDE use. Android Studio was normally closed after confirming termination of its background Android import; the app inventory verified it is not running. Keep it closed for CLI tests, type checks and exports. Reopen only for an IDE-specific requirement and avoid recurring IDE status checks. Acceptance worktree files were not removed or changed.

IOS3 Task 2 source committed locally at `2922503e636174dc04b14e4589f7cd1daa67a64f`: one bounded native request/stream-handshake core, typed account operations and the existing identity compatibility adapter. Worker verification passed 135 native tests across 17 files, mobile/contracts/identity-runtime/root-test types, scoped lint/format and iOS export. Source-map evidence selects the Expo native send binding and excludes the standards tooling binding, avoiding server ambient type pollution. Mobile Graphify scope rebuilt; other runtime source hashes verified unchanged. The feature tree records the new canonical reuse points, identity consumer and the concrete platform-binding reason. Independent task review is next; native lifecycle, simulator evidence, final whole-branch reviews, PR and merge remain pending. No Task 3 implementation or IOS4 work is claimed.

Task 2 independent spec/code review approved the source at `2922503e636174dc04b14e4589f7cd1daa67a64f` with no Critical/Important findings. It verified all 491 runtime and seven feature-document hashes and reviewed retained test/export evidence. Minor `IOS3-M2` records conflicting NO_COLOR/FORCE_COLOR export warnings; use one explicit color policy in subsequent required exports, without production changes or an otherwise unnecessary export rerun. Carry M1/M2 into final review. Task 3 may now implement native stream/resource lifecycle and prepare a synthetic runtime harness; no harness launch before independent exact-source code/security review.

IOS3 internal Task 3 is implementing native stream decoding/resource lifecycle and preparing a synthetic iOS proof harness from checkpoint `1a05f84dbfe817e4533f6a92d6f14ef9c29afca0`. Its first phase permits source/tests/static exports only. Actual Metro/service/simulator launch must wait for independent exact-source code/security review of the prepared harness and its ownership/cleanup boundary. No background polling, private-provider acceptance repeat, Android Studio launch, deployment or IOS4 work is authorized by this phase. The maps were fully reconciled at the preceding Task 2 boundary; affected scopes must be refreshed again after Task 3 source changes.

IOS3 Task 3 phase 1 source/tests committed locally at `325b3f572ab320742b2dda5f6259ac68ea37f9f5`. The native account stream reader reuses the shared decoder and transport; the scope-aware resource controller coalesces reads, conceals on lifecycle/authority loss, fences stale completions and bounds reconnects without idle discovery. Worker evidence reports 40 focused cases, 669 full units, package/test types, lint/format/builds, both platform exports, online Expo alignment and Doctor20/20 passing. Mobile Graphify scope rebuilt for the three new modules; all 494 runtime hashes, seven feature documents, 262 canonical references, reciprocal links and graph/path invariants passed before review.

A 136-file manifest freezes a prepared synthetic native probe and its executable dependency boundary. It uses an owned project to avoid touching existing .expo state and production entry/config bytes, imports actual authored modules/default native fetch, and guards real loopback bindings. No runtime/service/simulator launch has occurred. Independent exact-source code/security review must clear the probe before actual streaming/AppState acceptance. Static exports exclude probe sources; they do not replace native runtime evidence. IOS3 remains unmerged and IOS4 remains gated.

Task 3 production source is independently approved by code and application-security reviewers at `325b3f572ab320742b2dda5f6259ac68ea37f9f5`. Prelaunch tool finding T3-C1 blocks execution: the exact Expo invocation performs an unspecified-host preliminary port check that the guard rejects. A tooling-only fix/re-review is in progress; no service has launched. Low observation IOS3-T3-S1 records that inherited canonical Metro watch roots are not a filesystem sandbox; no private content read was established, and ownership claims must retain that limit.

Minor IOS3-M2 is addressed operationally: both later Task 3 exports used one explicit color policy and their retained logs contain no NO_COLOR/FORCE_COLOR conflict. The production exports select native Expo fetch and exclude probe sources on both platforms. M1 remains open for final whole-branch reviews. Native runtime evidence, final review, current CI and merge are still pending; source approvals do not close those gates.

After both exact-hash tooling re-reviews passed, the first approved synthetic runtime invocation exited before Metro readiness. No simulator opened and no native resource read/subscription occurred. Its owned Metro group and API server closed; both exact ports were absent afterward, and all 145 frozen files/production config hashes were unchanged. The retained log identified Expo root CLI developer logging via a 2g Unix socket, correctly rejected by the TCP-only guard. A source-backed tooling-only entry using the same exported Expo start handler is being prepared, preserving normal handler validation/offline mode and avoiding root logger IPC. A new manifest and both scoped reviews are required before another attempt. This startup failure is not native transport acceptance.

Task 3 tooling round 2 passed both independent scoped reviews; all 188 manifest hashes were reverified. The second approved attempt reached real API/Metro loopback readiness, then the existing Expo Go client rejected the SDK 58 project before any native resource traffic. The run exited after targeted owned shutdown, its supervisor group/API/listeners were verified absent, all 188 hashes and original config bytes matched, and the simulator booted for the attempt was shut down. No existing client or app data was updated, uninstalled or reset.

Native proof remains incomplete. The next investigation is an official compatible Expo Go client on a fresh separate simulator, preserving the existing device/client and private evidence. No dependency downgrade, production workaround, cloud build or automatic restart is authorized as a substitute for the missing native proof. Compatible artifact metadata and exact owned setup/cleanup must be reviewed before installation/execution.

The official SDK-specific Expo Go 58.0.7 archive was downloaded into an exclusive task-local artifact directory and matched its published 155676562-byte size and SHA-256 `17ab20f856c72690a750e79826ab5c90550a1441b1d1d67db6cd252af979b903`. All 989 archive entries passed containment/type checks; safe extraction found no links. Public metadata reports SDK 58.0.0, arm64 iOS Simulator slices and minimum iOS 16.4, fitting the available unique iOS 26.3.1 arm64 runtime. The ad hoc signature is not Developer ID identity verification; provenance rests on the official source and matching digest. No executable ran or device/client changed. Static compatibility is not runtime proof.

A narrowly scoped blank-simulator setup/cleanup helper is now being prepared for independent review. It must record and use only a newly created UUID, never clone/update/reset an existing device or client, and preserve uncertain creation/cleanup outcomes. The existing reviewed native probe will be reused on the isolated fixture only after setup approval. No fixture creation, app installation or probe retry has occurred.

IOS3 actual native acceptance passed on 4 November 2026 at source `325b3f572ab320742b2dda5f6259ac68ea37f9f5`. The isolated simulator used the official digest-verified Expo Go 58.0.7 client. Earlier failed attempts remain recorded: root CLI logging IPC, incompatible existing client and a probe-only Metro entry/server-root mismatch. The focused path fix passed installed Expo/Metro resolver RED/GREEN checks and both scoped reviews before activation. No production configuration, dependencies or existing simulator/client data changed.

The successful run streamed version 1 before EOF; 70 idle seconds retained exactly one resource read and one subscription despite keepalives. Real Simulator Home concealed data and closed the stream; a five-second background window added no resource requests. Real foreground caught up to version 2; a reconnect control caught up to version 3. Final counts were three resource reads, three subscriptions, three closes and zero live streams, followed by a two-second quiet window. Served indexed source-map evidence includes the actual native send binding and Expo fetch and excludes standards send.ts. The initial source-map parser assumed a flat map; recursive section traversal corrected that evidence parser without another network request. This is native transport/lifecycle evidence, separate from the 19 synthetic database commit/RLS cases and from physical battery or Android runtime measurements.

The native runner exited 0; its owned Metro group and API closed, and original production configuration hashes matched. Exact isolated-device cleanup succeeded using the independently approved stopped-process source/manifest restoration sequence. Shutdown/delete settled successfully; the captured fixture UUID is absent and all pre-existing UUIDs remain. The operation lock was removed, evidence/reservation/artifacts were retained, and final probe source/205 manifest hashes matched after restoration. No ownership journal or reservation was manually repaired. Final whole-branch code/security reviews, current PR CI and merge remain outstanding. IOS4 remains gated.

## IOS4 — Native Home and accounts: entry checkpoint

Branch `build/ios4-home-accounts` starts from host-verified main `874e15260eff07bb8e56548269c3efefc82a6252`. Predecessor [IOS3 PR41](https://github.com/FSS-Ltd/the-joint-app/pull/41) is MERGED at 2026-11-04T11:30:27Z. Reviewed head `8e78f678208c527bb1e08f0b5e6a13ce091d947a` passed current CI41819984301: Foundation job 126540411956 all 27 steps (669 unit, 331 integration, 181 browser), Native job 126540502455 all 15 steps (Doctor 20/20 and both exports). Both checkout logs prove test merge `f92ed3b4fedbeb09a9a1904ad0c83055829bb37d`; source/test/actual merge trees match `98bccb8bb91649a2cd1fb5b474690223b9dcb408`. Fresh protection checks found strict Foundation status enforcement, admin enforcement, zero configured required approvals, no blocking review or unresolved conversation. Protected exact-head merge used standing authority without bypass/self-approval. This supersedes IOS3 pending records.

IOS3 native transport/lifecycle acceptance and exact disposable-fixture cleanup passed. The old acceptance worktrees, private journals/tickets/provider identities and ignored public tooling/evidence remain preserved; no repeat provider handoff is authorized by this unit. Android Studio remains closed unless an IDE-specific requirement arises; no recurring status checks. No paid service, deployment, store action or future-unit implementation.

IOS4 is auditing existing native identity/primitives/API/lifecycle and canonical account/wealth services before implementation. The approved scope remains scoped Home summary, account list/detail/create/edit, dated owner-attested manual valuations, sharing and freshness. Reuse exact money/domain rules and server authority. Current source-backed audit found no native summary/valuation adapter and no whole-summary/date-expiry subscription; bounded account-page notifications cannot represent out-of-page summary changes. A narrow server summary observation/deadline extension is therefore justified, with no periodic discovery fallback. Existing source/feature maps are being reconciled before an exact file/interface plan. No IOS4 runtime source exists yet.

IOS4 internal Task1 source committed at `9ed898bb99316f45674284e348e47a6b2a48e508`: canonical wealth selector/scope serialization, shared WealthService read/observe evaluation, database London-midnight deadline, calculatedAt-independent fingerprints, one service instance for HTTP/events, native wealth/valuation adapters and selector guards. The worker reports 96 focused tests across 11 files, contracts/API builds, API/mobile/root-test types and scoped lint/format passing. The copied owned database fixture changed only namespace/constants and six fixed suite paths; 60 pure checks and static checks pass. Eleven new real-database cases are prepared, not executed. Independent exact-source code/security and fixture-boundary review must clear execution before actual database acceptance. No Task2 code, service launch, PR or IOS4 merge is claimed.

Parent verification at the Task1 source boundary passed the full unit suite: 682 tests in 92 files. API/mobile/shared Graphify scopes were rebuilt at 9ed898b; other scopes were fully source-hash verified. The two planned native UI features remain planned; this checkpoint adds no UI implementation. Exact fixture/source reviews and actual database acceptance remain next.

Task1 required DST coverage fix is committed at `f3b5bad0e598dd5381843b23765e5deae3e295a5`. Both scoped code/security reviews cleared the shared production clock helper and exact unchanged fixture before execution. The full unit suite passed 684 tests in 93 files; focused clock/event tests, relevant builds/types and scoped lint/format passed. The fixed-time DST adapter executes the production SQL helper, replacing only its statement timestamp with a bound test timestamp.

The reviewed owned synthetic PostgreSQL baseline then passed all 45 cases across six suites, including all 11 wealth-status cases. The UTC control failed the expected spring DST assertion (44 passed, one failed). The fixed-24-hour control failed both required DST assertions and a directly mutation-induced cross-statement deadline comparison (42 passed, three failed; 10 ms difference). These are intentional regression controls, not passing test runs. Every run reported settled creation, verified owned container cleanup and verified owned process termination. Both exact patches were reversed with hash guards; all 16 Task1 source/test paths match f3b5bad and all nine fixture hashes remain unchanged. No fourth run occurred. M1 pg concurrent-query warning remains observed and unattributed; no suppression or speculative serialization was added.

Parent independently verified source restoration, manifest identity and 12 preserved evidence-file hashes. Independent reviewers are assessing final execution/cleanup evidence before Task1 acceptance. API/mobile/shared maps were reconciled for Task1 and its clock fix; all 496 runtime hashes and 48 feature entries resolve. Home/account UI remains planned. No Task2 implementation, IOS4 PR, CI or merge is claimed.

Task1 is now independently accepted at f3b5bad by both code/spec and application-security reviewers. Both verified exact baseline/control results, restoration and cleanup. The additional 24-hour-control equality failure is confirmed as the expected effect of its moving relative deadline, with no unresolved production finding. P2 production-path DST coverage is closed. This accepts the internal Task1 only: IOS4 remains implementing, with no PR/CI/merge yet. Next permissible work is Task2 finance authority/lifecycle integration; Tasks3–4 remain unstarted.

IOS4 Task2 source is committed at `0c6447c4caa02a7c20d432dc2213cf8b8a12ca2d`: shared transport composition, cached verified-identity bridge, complete ready gate extension, finance authority/provider, focused resource/mutation hooks, DTO scope guards and safe errors. Worker final evidence reports 727 full unit tests in 96 files, mobile/root-test types, 25-file lint/format and diff checks passing. No financial route or screen exists yet. The opaque mutation target contract requires Task4 callers to freeze DTO/key/version, validate returned targets and explicitly await fenced sharing reconciliation; these are integration obligations, not current UI acceptance.

The mobile Graphify scope was rebuilt at that source: 71 detected runtime files, 213 nodes and 251 edges. Other runtime scopes were source-hash verified unchanged. The project index now covers 506 selected/502 detected runtime files, 48 features, 277 canonical references, 309 feature nodes and 535 directed edges. NATIVE_FINANCE is partial for its lifecycle foundation; Home/accounts remain planned. Canonical paths/symbols, reciprocal dependencies, all runtime/document hashes, graph endpoints and Markdown links passed validation. Plan-document references use specified_by relationships even inside partial/implemented features; runtime source relationships remain separate.

Independent Task2 code/security reviews are in progress. Both identified a possible permission-recovery loop across the actual identity gate unmount/remount boundary; the current hook-local refusal/cursor state and rerender-only test need assessment. Task2 is not yet accepted. Task3 cannot start before any required correction and scoped re-review. No IOS4 PR/current CI/merge is claimed.

Both Task2 reviews now require the same correction (IOS4-T2-C1/T2-S1): a persistently denied resource can restart after identity loading unmounts and recreates hook-local refusal/cursor state. One consolidated fix is assigned to the original implementer. It must retain bounded non-sensitive recovery metadata above the loading gate, preserve authority invalidation and prove delayed-refresh unmount/remount plus explicit recovery. Task2 remains unaccepted; Task3 remains gated.

Task2 fix round1 is committed at `7c5e3d8cb9b134513fa50580acc1e8fd828d9fe0`. IdentityRuntime now owns bounded refusal/issued-cursor metadata above the ready gate. Delayed-refresh loading, actual authored gate branch, unmount and genuinely fresh provider/hook tests cover persistent 403/404/invalid cursors without automatic reopen; explicit recovery and old-grant rejection are included. Metadata retains no financial DTO, write intent or token. Refusals are bounded to 32 plus one overflow barrier without eviction; 64 issued cursors evict oldest provenance, which fails closed with explicit first-page reset. Terminal/replaced authority and runtime cleanup clear metadata. Arbitrary/unissued cursor deep links are intentionally rejected.

The covering fix checks passed 107 tests in eight files, mobile/root-test types, ten-file lint/format and staged diff. These are source-composition checks, not native rendering. The 727-case full suite was run on the previous revision; this fix used the covering suite. Mobile Graphify rebuilt at 7c5e3d8 (72 detected files, 223 nodes, 270 edges); other selected runtime hashes verified unchanged. Both original reviewers are checking the exact fix before Task2 acceptance; Task3 remains unstarted and IOS4 remains unpublished.

Task2 is independently accepted at 7c5e3d8 after both original reviewers marked IOS4-T2-C1/T2-S1 ADDRESSED with no new blocking issue. They verified the exact fix, fresh-hook gate-remount regressions, bounded metadata/authority cleanup and retained 107-case passing evidence. This closes the internal Task2 only. Source-backed maps now validate 507 runtime hashes, 48 features, 280 canonical references, 311 feature nodes and 538 directed edges. The next permissible work is Task3 real gated navigation and Home/account read screens; write UI/native acceptance remain Task4. IOS4 has no PR, current CI or merge yet.

IOS4 Task3 source is committed at `1d897d461fcc82ccec2a2b50dff50c2aa090d644`: actual full-gate Home/More Tabs and Home Stack, invitation/security-preserving landing, Home server wealth summaries and bounded scope picker, live 50-row account list/detail, shared cursor-only Next/Previous/reset paging, exact domain formatting and a non-scroll Screen/Panel. Only the existing domain workspace link was added. Parent caught missing Previous before final commit; focused RED/GREEN and final source restore the approved pagination scope.

Final worker evidence reports 759 unit tests in 101 files, 14 focused UI/source cases, mobile/root-test types, scoped lint/format, both exports, frozen offline install/domain build, dependency alignment and Doctor20/20 passing. These are source/bundle checks, not native rendering or accessibility proof. Mobile Graphify rebuilt at that source (96 detected files, 265 nodes, 295 edges); other runtime source hashes verified unchanged. Home/accounts entries are partial for read UI, with review and Task4 write/native acceptance still pending.

Parent source review identified a concrete integration question for independent review: IdleSessionController publishes ready after ordinary activity, NativeIdentityController.publish currently creates a new verified pair, and the finance provider may consequently replace its context. The new useAccountPage resets history when that context object changes. The same path may unnecessarily replace scoped resource/mutation stores despite unchanged authority. No runtime reproduction or final finding is claimed yet. Both task reviewers must assess this source chain before Task3 acceptance. Task4 is unstarted; IOS4 remains unpublished/unmerged.

Both Task3 reviews require fixes. Ordinary session activity was independently reproduced replacing the verified pair/context despite unchanged MeResponse and full authority, resetting page two and Previous history. Shared resource/mutation store churn follows from the same context dependency; no user write loss or authorization bypass is claimed. Code review also confirmed the approved light selected navigation pill is missing. One consolidated fix may narrowly stabilize the native identity publication boundary and add token-based selected treatment, preserving true refresh/authority invalidation. Task4 remains gated.

Both current export logs also contain the NO_COLOR/FORCE_COLOR warning despite the attempted explicit parent policy. Exports succeeded. This Minor is retained separately from the old pg warning and will be addressed during the next necessary post-fix exports without suppressing unrelated output or rerunning unchanged bundles solely for noise.

Task3 fix round1 is committed at `7b0658230c100d2e68427c93dcc6c20d9e31b21a`. No-op ready publication with the same native actor and exact MeResponse now preserves the verified pair/context. Real idle/controller/provider/page/resource/mutation tests prove stable page-two history/selection, subscription/read counts and pending/uncertain intent across ordinary activity; true refresh returning the same MeResponse still invalidates and resets. Shared activity scheduling, expiry and page-owner checks were preserved. Navigation now has a token-based light selected pill, forwarded Router/native selection semantics, minimum touch target and font-scale/safe-inset reservation.

Covering evidence passes 271 native tests in 32 files, 12 final focused activity/pill cases, mobile/root-test types, scoped lint/format and both affected exports. The previous 759-test full suite is historical, not a fresh full-project run for this fix. New necessary export runs use NO_COLOR unset and FORCE_COLOR=0; their actual worker logs contain no color warning. Original warning-bearing logs remain retained, so the Minor recurrence is addressed operationally without hiding history or suppressing unrelated warnings. Both original reviewers must verify the exact source fix before acceptance. Mobile Graphify rebuilt at 7b06582 (97 detected files, 267 nodes, 296 edges); unchanged runtime scopes were source-hash verified. Task4/native UI proof and IOS4 publication remain pending.

Task3 is independently accepted at 7b06582. Code re-review marks P1/activity, P2/selected pill and P3/latest-export evidence addressed, with no new breakage; AppSec marks IOS4-T3-S1 addressed and confirms true invalidations still fence work. This closes internal Task3 only. Map validation covers 532 runtime hashes, 48 feature IDs, 300 canonical references, 329 feature nodes and 558 directed edges. Home/accounts remain partial for actual native acceptance and account writes. Next permissible work is Task4 forms plus prepared synthetic native proof tooling; no API/Metro/device launch before its exact-source independent reviews. Final whole-branch reviews, IOS4 PR/current CI and actual merge remain outstanding.

IOS4 Task4 phase1 source is committed at `522a87ce6f8d3ed3913f62e798d4a48fc06f1c54`: native create/edit/valuation/sharing routes, focused immutable intent/draft/recovery modules, owner controls and an exact rendered-resource capture guard. The original worker recovered from a transport/compaction interruption without restarting completed work. No runtime API/Metro/device/client was activated. Parent verified the 34 changed paths/source hashes and 20 final check exits/log hashes. Retained evidence passes 807 units/110 files, 311 native/identity cases, 57 pure tooling cases, all workspace/root-test/tooling types, scoped lint/format, both exports, dependency alignment and Doctor20/20. Private-env integration/e2e and root Next build were not run in this source-only phase; applicable final CI remains mandatory.

Task4 native tooling has an exact manifest `fe7a164401ff78f22c89744b4663e560898beedc39b6acb0015905c5535303bf`, source-only hash verification and a bounded owned-fixture recipe. Both independent Code/AppSec reviews are now running against the same source and manifest; no activation clearance is claimed. Actual rendered writes, two-adult scope changes, navigation, idle/background/foreground counts and enlarged text remain pending. Installed Xcode26.6 does not prove newer VoiceOver testing support; actual iOS VoiceOver, Android runtime and physical energy evidence remain unverified. Android Studio stays closed, without recurring checks. Mobile Graphify rebuilt at522a87c:115 detected files/311 nodes/341 edges; all550 selected runtime hashes and48 feature IDs/316 canonical references/345 feature nodes/576 directed edges validate. Feature entries now include write routes/helpers and reciprocal screen/shared-foundation connections, while source tests remain distinct from runtime acceptance. IOS4 has no PR/current CI/merge yet; IOS5 remains gated.

Task4 phase1 reviews require fixes before activation. AppSec reproduced a retained create callback dispatching twice with distinct keys after the first success; canonical synchronous new-intent admission must require current idle state or explicit reset. Both reviewers found the synthetic origin lacks transport keepalives, causing recurring ~46-second reconnect/read work. Code review also found offline sends authorization invalidation/403, so that control exercises revocation rather than transport recovery. Three unique Important findings are assigned to the original implementer in fix round1; source-only regressions, exact manifest refresh and both scoped re-reviews are required. No actual native execution or IOS4 publication is authorized yet. Native expected-version replay evidence and actual pagination are separately recorded Minor evidence gaps for acceptance/final review, not passing native checks.

Task4 fix round1 source is committed at `03a690e99dba4efb8612b832a9eaa3468a608aad`. Canonical mutation admission now requires current idle state; retained success/error callbacks cannot replace an intent until explicit reset. Source-only fixture changes restore 15-second comment keepalives with teardown and separate offline503 transport loss from explicit authority invalidation. Covering checks pass 313 native/identity cases, 62 pure tooling cases, mobile/root-test/tooling types, scoped lint/format and both exports. Parent verified cumulative36-source hashes, three fix paths, 17 passing command records, three expected RED failures and all38 preserved baseline snapshot hashes. The wider807-unit run remains pre-fix historical evidence.

Both original independent reviewers are assessing the exact fix/source and new manifest `621804b77ea2e868fe70d6467433e81589f1b0b2c09d304fb4755c13b18631fe`; activation remains gated. The fixture proof spans180 fake-clock seconds through actual production reader/controller code without a listener/socket; actual90-second native idle measurement remains pending. A retained Node22 MockTimers ExperimentalWarning is recorded for final review. Runtime Graphify and the feature tree now match03a690e, validating550 source hashes/48 feature IDs/316 canonical references. Native pagination/large-scope evidence remains an achievable Task4 acceptance item; the current fixture cannot yet exercise Next/Previous. No IOS4 PR/current CI/merge or IOS5 work is claimed.

Task4 fix round1 is independently accepted at03a690e: both original reviewers mark all three Important findings addressed, with no new Critical/Important breakage. They separately clear the exact621804b7 tooling/0072a1d9 recipe; this is preparation clearance, not native acceptance. The plan records source implementation complete and leaves actual proof/final delivery unchecked. Before activation, the original worker is preparing the already-required native pagination/large-scope scenario, safe counters that include rejected financial requests, and replay-version equality evidence without changing backend semantics. Production source, dependencies, simulator/process ownership and all earlier snapshots remain unchanged. The amended exact fixture/manifest requires both affected-scope reviews. IOS4 remains unpublished and unmerged.

The first actual IOS4 native acceptance run failed on a blocking render defect: opening a successfully saved negative valuation throws Cannot convert BigInt to number in canonical formatMoney/Intl.NumberFormat. The aggregate formatter has the same source-level dependency risk. A separate known400 input response mislabels rejected validation as connection failure and offers an unchanged retry. Before stopping, actual evidence showed111.6seconds of idle with every counter unchanged/live1, duplicate-create one commit, metadata readback, no-request local decimal rejection, future-date rejection/no commit, and uncertain valuation replay with matching key/body/version and one committed change. Scroll/Next/Previous/50-selection, remaining permission/recovery/lifecycle and large-text scenarios are incomplete; coordinate clicks worked while tested drags did not move the list. No production scroll cause is claimed.

The original reviewed-byte shutdown and owned-device cleanup succeeded: API/socket/streams and Metro group closed, protected source/config/.expo unchanged, exact created UUID deleted and actual final inventory matches all27 prior UUIDs. All97 actual evidence hashes are preserved. Exit0 shutdown is not passing acceptance. Parent also discovered the old execution manifest silently omitted required import-only workspace packages; listed-file hash verification was insufficient to prove closure. The failed-run source map and observed outcomes remain retained, with this coverage limit explicit. Task4 source-only fix round2 now covers portable exact shared GBP formatting, financial validation recovery and required dependency freezing, with a separately guarded append-only re-test proposal. No second setup or activation is currently authorized; the original reservation is intact. Both independent reviews and verified actual re-test remain required before publication/IOS5.

IOS4 Task4 fix2 source is committed at `48252ba061190ed4cfaaa1a5854438fe12a10b4f`. Both public money-formatting paths reuse exact bigint string grouping, retaining int64/aggregate boundaries and avoiding native Intl(BigInt). Rejected400 INVALID_INPUT now guides explicit correction/reload; uncertain/network/MFA/version behavior is preserved. Worker reports812 units/113 files,12 direct type-check projects, scoped lint/format and both platform exports passing. Initial root pnpm typecheck unexpectedly invoked Turbo build dependencies including Next web build and failed two new test typings; that scope deviation/log remains retained, tests were corrected and direct tsc passed. No additional tracked outputs or runtime launch were reported. Exact final tooling freeze, parent evidence verification, independent re-review and actual native re-test remain pending. Runtime Graphify rebuilt mobile/shared at48252ba:551 selected/547 detected files, shared70 files/211 nodes/310 edges; other selected hashes unchanged. No IOS4 PR/current CI/merge or IOS5 start.

Both independent Task4 fix2 reviews approve product48252ba: N1 exact portable formatting and N2 rejected-input recovery are addressed in source; actual native re-test is pending. They reject exact2f72/8041 tooling activation for one remaining N3 Important gap: metadata-file anchors can stay unchanged while an installed package directory is replaced, allowing unfrozen relative exports. AppSec reproduced this with the actual resolver in isolated temporary fixtures without executing package code; no real installation or runtime was changed. No additional successor-guard finding or new product breakage was found. Original implementer owns focused round3 package-root binding, regression and re-freeze; product812-unit/type/export evidence remains retained. No native recheck/IOS4 publication/IOS5 is cleared. Runtime maps remain48252ba; helper map is explicitly pending during tooling changes.

Task4 fix3 is independently accepted for N3: exact installed package-directory/root anchors and same-root regular metadata now fail closed on the reproduced substitution, and freezer enumeration uses that same root. Both original Code/AppSec reviewers approve exact manifest89ba65071fbbcdfd6e720cff9e82b5720ec9fb4ca6567866f3f3341470e8e51b and recipe61fe4334d25cfb0c84c32e41c1b62b0235d6c186cc0d423476ade420f42e4c38 with no new Critical/Important/Minor findings; product48252ba acceptance remains. Parent read both full reports and verified26 check records, exact RED/GREEN and47 pure tests, scoped lint/format/syntax/freeze/shared verifier. No new product suite or runtime was implied. Source41/nativehelpers38 and all original97 evidence files/52fix2inputs/46originalinputs/150post-run snapshots are preserved. Helper graph44files142nodes255edges and feature/runtime maps551hashes48IDs317refs validate. Next permissible action is the reviewed sole-successor synthetic native re-test under its one-setup/two-sequential30-minute-session cap; actual acceptance, final wholebranchreviews, IOS4 PR/current CI/protected merge and IOS5 remain gated.

IOS4 is paused at the user-requested usage stop. The corrected native run on48252ba/exact89ba tooling observed validation-specific future-date rejection/no commit and explicit reload, negative/account/adult/aggregate formatting, exact beyond-Number-precision detail/Home strings, matching retained key/body/version replay without another commit,128.79252s healthy idle with all14 counters unchanged/live1, and140.46664s background quiet with all14 unchanged/live0 plus actual AppState and foreground scope recovery. These are partial native results, not Task4 acceptance. Scrolling/full visual wrapping, paging/50selection, broader financial/permission/MFA/sharing/deep-link/route cases and offline exhaustion quiet/recovery remain incomplete. Singular1 accounts copy is deferred for final review. Physical VoiceOver/energy/Android/provider and durable backend evidence are not inferred.

Cleanup is verified from actual reviewed receipts: native/API/streams/sockets/Metro group closed, production configuration unchanged, sole successor deleted and exact27-device before-inventory retained. Parent inspected the final actual inventory receipt and cleanup proof. Both consumed setup reservations and all evidence stay preserved; no active test resources or session2 remain. Current product/source checks remain812 units,12 direct type projects and both exports; fix3 tooling47 pure tests/lint/format/syntax/full verifier and independent Code/AppSec approval are retained. No further tests, implementation or reviews ran after the stop trigger. This checkpoint is documentation only; no new verification pass is claimed. IOS4 has no PR/current CI/merge, IOS5 is gated. Resume requires inspecting the partial report and proposing any further owned execution within a newly reviewed bounded plan; never rerun consumed setup or reuse deleted UUIDs.

OpenCode resume reconciliation is complete. The saved partial native recheck outcomes on product `48252ba061190ed4cfaaa1a5854438fe12a10b4f` are now folded into the feature-entry prose: MONEY, WEALTH, NATIVE_HOME and NATIVE_ACCOUNTS in `docs/features/finance.md` carry the observed future-date 2099-01-01 rejection with zero commits and correction guidance, negative `-£1.25` account/adult/Home aggregate, exact beyond-Number-precision `£9,007,199,254,740,993.01` detail/adult/Home strings, matching retained key/body/version replay with zero additional commits, 128.79252s healthy idle with all 14 counters unchanged, 140.46664s background quiet with live 0 and foreground recovery via owned Expo icon, and offline five rejected subscription attempts with exhausted-quiet/recovery incomplete. `FEATURE_TREE.md` summary reflects the same partial-not-accepted status. The `pending_runtime_evidence_reconciliation` marker is set to `reconciled` with a dated note in the project index.

Map freshness is restored with the task-local read-first refresh tooling. `refresh-feature-graph.py` re-extracted 48 features from the working-tree feature documents with reciprocal dependency verification and re-baselined `feature_tree.source_hashes` to the current doc bytes at revision `48252ba061190ed4cfaaa1a5854438fe12a10b4f`: 346 feature nodes, 577 directed edges, 317 canonical references. `refresh-runtime-graphs.py` verified all six runtime scopes unchanged by complete selected-file hashes (551 selected hashes, 547 detected files: api 123, mobile 117, web-routes 80, web-components 123, shared 70, operations 38). `validate-current-maps.py` now passes outright: canonical paths/symbols, reciprocal dependencies, runtime/document hashes, graph endpoints/directions, Markdown links/anchors, and native tooling 44/44 detected. The pass output is recorded in `.superpowers/sdd/2026-11-04-ios4-home-accounts/map-current-evidence.json`. Runtime VM remains closed; no repo working-tree commit was made for this documentation step.

Reconciliation status: partial native results are recorded as partial, Task4 native acceptance is not cleared by them. Next permissive step per handoff section 9 is planning the smallest safe continuation for the missing native matrix items (paging/50-selection, remaining create/metadata/stale/debt/adult/date cases, MFA/sharing/two-adult/revocation/deep links, offline exhaustion/recovery and route blur/draft lifecycle, Dynamic Type/narrow-width/wrapping/scrolling/reachability), followed by whole-branch independent Code/AppSec review and the IOS4 PR. Native execution remains gated on a newly proposed bounded plan, ownership/cleanup guards, exact source/tooling freeze and applicable authorization; no setup rerun or UUID reuse. No IOS5 work starts before IOS4 PR/CI/protected merge.

PR42 CI repair requested after failed run42062455210 on head01a34f1333c77ee4095904989f409181ac73aa14/test-mergef69116c3911889f5d661bfe5e9e54ee42b4098f6. Native TS2307 was a clean-checkout prerequisite gap: only contracts/identity were built while new mobile imports consume domain dist. Native CI now builds the declared mobile dependency closure. The wealth idle integration spy observed167calls/15.1s while unrelated parallel fixtures committed to the shared payload-free status channel; StatusEventHub legitimately wakes authenticated observers on those notifications. The wealth suite now reuses the existing serial capacity phase before parallel integration writers. All assertions, timeouts, test inclusion, production event/authority logic and CI protections are unchanged.

Focused local checks passed under Node22.23.3: selector lists contracts/domain/identity; their builds and mobile types; Vitest files-only listing places wealth-status exactly once in capacity; direct root-test types; scoped ESLint/Prettier/diff check. No private-env local integration/database/browser service or exhausted Task1 runner was used. Independent code/security review is scoped to this two-file repair; clean host CI must confirm resolution before any merge. Existing native acceptance gaps and consumed reservations remain separate and unchanged.

## IOS4 — delivery record

IOS4 is delivered. [PR42](https://github.com/FSS-Ltd/the-joint-app/pull/42) was merged by the founder at 2026-11-05T22:31:18Z at `58f6c24190401d33e1bc6c6716f45022a1f2fdac`; `origin/main` is that merge commit and `build/ios4-home-accounts` is fully contained in it. Reviewed head `fe5e90494377abfeb244d7ad2bb02a379d3a0043` passed [CI42093646454](https://github.com/FSS-Ltd/the-joint-app/actions/runs/42093646454): Foundation job 127477912070 all 27 steps (812 unit, 342 integration and 181 browser tests) and Native job 127477912732 all 15 steps (Doctor and both exports). The exact test-merge revision is retained in `.superpowers/sdd/2026-11-04-ios4-home-accounts/ci42-repair/host-success.json`.

Two delivery deviations are recorded, not closed. The IOS4 plan requires final independent whole-branch Code Reviewer and Application Security Engineer approval before publication; the host PR carries no formal review or review decision and the ledger's last state still shows that review as not reached. The independent approvals retained are task- and fix-scoped (Tasks 1-4, fix rounds 1-3), not whole-branch. Separately, the native acceptance matrix remains partial: paging/50-selection, the remaining create/metadata/stale/debt/adult/date cases, MFA/sharing/two-adult/revocation/deep links, offline exhaustion/recovery, route blur/draft lifecycle and Dynamic Type/narrow-width/wrapping/scrolling/reachability were not re-observed on the merged bytes. Observed results on `48252ba`, including 128.79252s healthy idle and 140.46664s background quiet, remain as recorded and stay partial. Deferred Minor `1 accounts` summary copy remains open. IOS4 must not be described as fully accepted because it merged; a defect found in these areas is a follow-up fix, not evidence that the gap was covered.

## IOS5 — Activity and reviewed CSV import: entry checkpoint

Branch `build/ios5-activity-imports` starts from host-verified `58f6c24` (IOS4 merge). Plan: [2026-11-06-ios5-activity-imports.md](superpowers/plans/2026-11-06-ios5-activity-imports.md). IOS5 owns native activity list/detail with search, month and classification filters, annotations, splits and transfers, plus CSV file selection, mapping, preview/rejection/deduplication, commit, history, rollback and original-file deletion.

Reuse audit at entry: the activity API is per-account (`transactionListQuerySchema.accountId` is required) and the web activity page selects an account through the shared finance scope, so native activity starts from an account choice rather than a new household-wide feed. `statusSubscriptionSchema` has `wealth`, `account`, `accounts`, `import`, `export`, `archive-export` and `deletion` kinds but no transaction page kind, and the web activity list refreshes through a local revision counter, so one bounded native page observation is a demonstrated gap rather than a duplicate feed. `import` already exists as a status kind for batch progress. The mobile workspace has no document picker dependency; the SDK58-compatible `expo-document-picker` version must be verified from official documentation before it is added. `MAX_CSV_BYTES` (10 MiB) and `MAX_CSV_ROWS` (50000) already bound uploads server-side.

Next permissible action is Task 1 RED tests for the bounded activity page observation and native activity adapters. No IOS5 source exists yet. IOS6 cannot begin before IOS5 review, current CI and verified merge.

## IOS5 — Task 1 and Task 2 checkpoint

Task 1 is committed at `5813a7e` on `build/ios5-activity-imports` (draft PR44). The shared status protocol now has a `transactions` selector with required `accountId`, canonical wire-form filters and unknown/ambiguous-field rejection. `TransactionQueries.observePage` reuses the existing page query and returns `{items, hasMore}` without sealing a cursor, so request-to-request fingerprints stay stable; `StatusResources` fingerprints the ordered page facts plus authority and reports no known expiry. The native adapter exposes list, read, create, patch, annotation and split writes with caller-supplied version and idempotency keys. Transfer is intentionally deferred to Task 3 until its existing route and DTO are confirmed, per the plan.

Task 2 source is committed at `4510ee5`: account-scoped activity list with explicit search, month, classification and uncategorized filters, single-page replacement with previous/next history, a fenced one-shot transaction detail read, activity routes hidden from the tab bar and a Home entry point. Detail reads are aborted on blur/authority change and never poll.

Verification on the working tree: 14 Task 1 focused tests and 12 Task 2 tests pass; API, mobile and root-test `tsc` pass; scoped ESLint and Prettier pass. The contracts package was rebuilt locally because `@joint/contracts` resolves to `dist`; generated `dist` is untracked. No platform export, simulator/device run, push-notification, Dynamic Type or VoiceOver evidence was produced for Tasks 1-2. Independent task acceptance, the Task 3-5 work, final whole-branch Code/AppSec review, both exports and host CI on the latest head remain outstanding. PR44 stays draft; IOS5 is not delivered.

## IOS5 step 3a: native transaction annotation

OpenCode handoff reconciliation: `OPENCODE_HANDOFF.md` (5 November) is superseded. IOS4 merged as PR42 and its review fixes as PR43; IOS5 PR44 merged at `1ecbe82` with only Tasks 1-2 (activity observation, list and detail). The remaining IOS5 work is Task 3 (annotations, splits, transfers), Task 4 (CSV import) and Task 5 (native acceptance). Per the one-PR-per-step gate, Task 3 is split into 3a annotations, 3b splits and 3c transfers, each its own PR after the previous one is merged with green CI.

Step 3a is implemented on `feat/ios5-activity-writes`: native edit of category, classification kind, merchant and note. It reuses the server annotation contract and IOS4 write boundary: `useWriteDraft` is now generic over its base row (account default unchanged), `WriteFeedback` takes optional outcome copy (account default unchanged), and `capturedAuthority`/`assertActive` are exported from `accounts/write-intent.ts`. New: pure `annotationInput` (changed fields only, null to clear, `noteVersion` bound), `annotationWriteIntent` (frozen DTO and row version, authority fence, mismatched response treated as uncertain), `useAnnotationWrite`, `useTransactionRead` (the fenced one-shot read extracted from the detail screen), `AnnotationScreen`, the `annotate` route and a detail-screen entry shown only when the server grants classify or note. `CLASSIFICATION_LOCKED` and `INVALID_CLASSIFICATION` now map to a reload recovery instead of a repeat. Paired or split rows keep category and kind locked; merchant and note stay editable, matching the server. No client-side classification rules were added.

Checks on the working tree (Node 22.23.3): 835 unit tests in 118 files pass (the two suites needing `@joint/database` pass after building it locally); mobile `tsc`, `expo install --check`, Doctor 20/20 and both exports pass; ESLint and Prettier pass on all 17 changed files. Private-environment integration, browser and database suites were not run locally; host CI is required. Not established: any simulator, Dynamic Type, narrow-width or VoiceOver rendering of the new screen, because new native execution needs its own reviewed bounded proposal. The mobile Graphify scope was rebuilt after the code was written, not read before it. Splits, transfers, import and Task 5 acceptance remain open; the IOS4 native matrix gaps and the `1 accounts` copy Minor are unchanged.

Independent code and security review of the 3a diff found no Critical issue and one Important: after the app is backgrounded the draft is cleared and the screen stayed blank. It is fixed (the screen now offers an explicit "Reload transaction" recovery, with a regression test) and not yet re-reviewed. Minor items left open: the shared `VERSION_CONFLICT` and uncertain messages still say "account" because IOS4 tests assert that wording; the fetched transaction stays in component state while backgrounded (the pre-existing detail screen does the same); and the response check does not require a version increase because a note-only write does not bump the transaction version.

Scoped re-review of that fix found one Important regression: adding `draft.base` to the seeding effect's dependencies made "Discard draft and reload" re-seed the draft from the stale read, pinning the old row version. The dependency is removed (the explicit "Reload transaction" branch alone covers the cleared-draft case) and a regression test fails with the dependency and passes without it. The remaining re-review points hold: every ready, visible and allowed state renders a usable control, there is no reload loop and no replacement intent can be dispatched over a pending or uncertain write. Not re-reviewed again after this last change. Minor, left open: the `!visible` state shows "Checking access" with no action, a gap the account screens share.

## IOS5 step 3b: native transaction splits

Predecessor verified on the host before starting: [PR45](https://github.com/FSS-Ltd/the-joint-app/pull/45) merged at `b7ec7fa14c7acd2f65a22bb4154a4823f9654c88`; Foundation and Native checks both succeeded on its final head `fdcbe62`. Step 3b starts from that merge on `feat/ios5-activity-splits`.

Owners can split an unpaired, non-zero transaction into 2 to 20 signed components, edit an existing split, or clear it. Amounts are parsed with `parseMoneyInput` and checked with the shared `validateSplits`, so the sign and kind rules are the server's, not a parallel set; the remainder is exact BigInt arithmetic, and a clear sends `{lines: []}` only when a split exists. The write reuses the annotation boundary: the session hook is now a generic `useTransactionWrite` with annotation and split wrappers (no `draft.base` seeding dependency, per the earlier re-review), the screen ladder is the shared `TransactionWriteBoundary`, and the split intent deep-freezes every line and the row version so a retry replays identical bytes. `INVALID_SPLITS` recovers by reload. The detail screen offers "Split across categories" or "Edit split" only when the server grants the right and the row is unpaired.

Local checks (Node 22.23.3): 853 unit tests in 119 files pass; mobile `tsc`, `expo install --check`, Doctor 20/20 and both exports pass; ESLint, Prettier and the root test project's types are clean for the changed files. Private-environment integration, browser and database suites were not run locally; host CI is required. Not established: any simulator, Dynamic Type, narrow-width or VoiceOver run of the splits editor, which needs its own reviewed native proposal. The mobile Graphify scope was rebuilt after the code was written. Transfers (3c), CSV import (Task 4) and Task 5 acceptance remain open, as do the IOS4 native matrix gaps.

Independent code and security review of the 3b diff found no Critical or Important issue. It confirmed the annotation regression checks (no `draft.base` seeding dependency, same fencing, version capture and cleared-draft recovery), that the split rules match the server, that no money passes through Number, and that `submit(override)` cannot bypass the editable, permission or authority checks. Two Minors were fixed (one shared blank-line builder, and an unchanged split is refused instead of bumping server versions). Left open on purpose: "Clear split" is a single tap without confirmation (as on the web); the allocation line is a polite live region that updates per keystroke; and the Picker's behaviour when a line is removed needs a simulator check.

## IOS5 step 3c: native transfer link and unlink

Predecessor verified on the host before starting: [PR46](https://github.com/FSS-Ltd/the-joint-app/pull/46) merged at `dae183acf05efd0b1d2fad212a4b3c25592f9d0e`; Foundation and Native checks both succeeded on its final head `a90626a`. Step 3c starts from that merge on `feat/ios5-activity-transfers`.

Owners can pair an unpaired, unsplit row with the opposite entry in another account they own, and remove a confirmed pair. The adapter reuses the existing `/transfers` confirm, read and remove routes; the transport's method type gains `DELETE` (the remove route takes a JSON body, and the no-body-on-GET guard is unchanged). Candidates are exact opposite GBP amounts by BigInt in a different account, unpaired and unsplit, loaded as explicit fenced pages with an explicit "Load more", so nothing polls; the load-more request is aborted on unmount and authority change. Confirm sends both row versions with one idempotency key generated once per submit; remove reads the pair first and is submitted only when the pair's version for the open row equals the open row's, so no unseen version is sent. The bodies are frozen, a retry replays identical bytes, and a response that does not contain this row is uncertain. `INVALID_TRANSFER` recovers by reload. The detail screen offers "Link a transfer" or "Remove transfer pair" only when the server grants it.

Local checks (Node 22.23.3): 879 unit tests in 122 files pass; mobile `tsc`, `expo install --check`, Doctor 20/20 and both exports pass; ESLint, Prettier and the root test project's types are clean for the changed files. A new dependency-aware effect harness proves the fetch hooks abort on authority change and unmount, and a mutation check confirmed the load-more abort test fails without its cleanup. Private-environment integration, browser and database suites were not run locally; host CI is required. Not established: any simulator, Dynamic Type, narrow-width or VoiceOver run of the new screens, which needs its own reviewed native proposal. The mobile Graphify scope was rebuilt after the code was written. CSV import (Task 4) and Task 5 acceptance remain open, as do the IOS4 native matrix gaps.

Independent code and security review of the 3c diff found no Critical issue and two Important ones, both addressed with regression tests that failed first. "Load more" could stay pending and disabled forever when the account changed mid-request, because an aborted request never reset its flag; it now resets whenever a request is superseded. The removal flow relied on an incidental draft clear to refetch the pair after "Discard draft and reload"; the pair read now takes an explicit refresh key tied to the re-read row, so a changed other leg cannot leave it on stale versions. Minors fixed: a picked entry stays selectable when a refresh drops it, and "Retry entries" no longer reloads the account list. The review confirmed that `DELETE` with a JSON body is validated and sent like PATCH or PUT and that nothing else assumed four methods. Not verified by anyone: that `expo/fetch` itself sends a DELETE body on a device, which needs the native run. Left open: remove has no idempotency key, so retrying after an uncertain DELETE that committed gets a 404 and the user must use "Discard draft and reload"; and an unowned counterpart surfaces generic server copy.
