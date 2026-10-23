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
