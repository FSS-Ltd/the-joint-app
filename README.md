# The Joint App

Household finance built around shared goals and individual privacy. **In development: local identity, private accounts and CSV/manual activity. Spending, budgets and monthly review are available locally. Privacy and recovery controls are being verified.**

## Local setup

Use Node 22.23.3 and pnpm 10.6.5. Start Docker Desktop, then:

```sh
cp .env.example .env
pnpm install --frozen-lockfile
pnpm db:up
pnpm auth:up
pnpm build
pnpm db:migrate
pnpm db:runtime
pnpm db:seed
pnpm imports:setup
pnpm privacy:setup
pnpm dev
```

Web: http://127.0.0.1:3000. API: http://127.0.0.1:3001/health/live and /health/ready. PostgreSQL: loopback port 5432. Local credentials are disposable development defaults, never production credentials. Auth is loopback http://127.0.0.1:15421/auth/v1; its development email inbox is http://127.0.0.1:15424. No messages leave the local inbox.

Run apps separately with `pnpm --filter @joint/web dev`, `pnpm --filter @joint/api dev`, and `pnpm --filter @joint/worker dev`. Build shared packages first with `pnpm build`. Production builds start with the package's `start` script; the worker runs bounded CSV preview, commit, restore and export jobs, plus verified local deletion cleanup. Stop with Ctrl-C.

`pnpm auth:down` stops Auth and its inbox. `pnpm db:down` stops Compose services and preserves volumes. Do not delete volumes containing wanted data.

## Checks

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

If port 5432 is occupied, set POSTGRES_PORT=15432 and update DATABASE_URL in .env. Root integration/browser commands load `.env`, `.env.database`, `.env.auth` and `.env.imports` automatically; exported environment variables take precedence.

Integration and browser tests require migrated local PostgreSQL and built packages. Browser tests start the web app automatically and bind their synthetic APIs on ports 3001, 3302, 3402, 3502 and 3602, plus isolated identity/account/review web processes on 3301, 3401, 3501 and 3601; stop development processes on those ports before testing. The API and worker load `.env.database` after `.env`; both load `.env.imports`, and the API also loads `.env.auth`. CI uses disposable PostgreSQL, Auth and email containers with synthetic identities. Type checking builds package declarations first and also checks test sources.

## Structure and delivery

- apps/web: Next.js introduction, identity/household onboarding and mobile-first manual accounts.
- apps/api: NestJS health, server-owned identity/session and household/invitation and private account/grant endpoints.
- apps/worker: independent local process and bounded job runner with staged CSV publication.
- packages/contracts: validated health, identity, household, account and exact-Money interfaces plus environment validation.
- packages/database: bounded connectivity, Prisma migrations and durable Job/Outbox storage.
- packages/domain: exact GBP input and display helpers; no floating-point money arithmetic.
- packages/config: shared TypeScript settings.
- docs/joint-app: sanitised product/build specifications.

See [bootstrap decisions](docs/decisions/bootstrap.md), [progress](docs/progress.md) and [version matrix](docs/decisions/version-matrix.md).

Repository visibility is temporarily public for Actions usage. No open-source licence is granted. The original local plan and all environment secrets are excluded from Git. Authentication uses the maintained Supabase Auth server locally. Reports and direct provider integrations remain future steps.

All application execution/data remain local until the MVP is complete and the founder explicitly approves deployment. No hosted previews, staging, production, deployment hooks or cloud app/database provisioning before that approval. GitHub source delivery and synthetic CI remain authorised. Existing Vercel Pro and a free database are future hosting targets only.

See [Task 1.1 design and limits](docs/decisions/task-1.1-plan.md) for queue semantics and [Task 1.2 identity design](docs/decisions/task-1.2-plan.md) for sessions and membership.

## Local identity

Open `/sign-up`, create a synthetic individual account and copy its six-digit confirmation code from the local inbox. Each adult uses a separate email/password. Create a household or explicitly accept an invitation addressed to your verified email. Invitations expire after seven days; creating another replaces any pending invitation. Share the one-use link manually; the app sends no external invitations. Joining a household does not grant access to private financial accounts.

Open `/security` to enroll and verify a TOTP authenticator. A later sign-in requires the enrolled factor before household actions. `/recovery` sends a local email code and requires an existing authenticator when enrolled. A successful password reset keeps its current browser session and revokes other app sessions. Local/global logout revokes server registry entries immediately, independently of JWT expiry; logout reloads the page. Lost-authenticator support and production recovery operations remain release gates; there is no partner override.

`pnpm auth:setup` creates ignored `.env.auth` with restrictive file permissions and generated local signing/encryption keys. Existing settings are preserved. Keep that file with its development volumes: replacing its encryption key makes stored provider sessions unreadable, and replacing its signing keys invalidates local Auth credentials. Never commit it or use its keys/data outside local development. The explicit local privacy setup copies its synthetic admin key into a separate ignored worker-only file; the API receives no privacy admin credential. Configure a different Auth HTTP port before initial setup using `AUTH_HTTP_PORT`; keep issuer, gateway and signed local keys consistent.

Only random opaque session cookies reach the browser; provider access/refresh tokens stay encrypted in PostgreSQL. Mutation requests require matching Origin and CSRF proof. The loopback synthetic inbox allows up to 1,000 Auth emails/hour with a one-second resend cooldown so repeated test runs do not exhaust the vendor default. This is not a production abuse-protection configuration. Real Auth integration tests require `pnpm auth:up`, migrated application data and built packages. No hosted Supabase project is provisioned.

The seed creates two synthetic households without usable login sessions. The earlier bootstrap test route verifies a signed bearer session and membership; the identity UI uses `/api/me` with the opaque session cookie.

## Local private accounts

Run `pnpm db:runtime` after migrations and before starting the API/worker or tests. It creates a restricted local login and ignored `.env.database` with random runtime credentials plus the maintenance URL. Preserve this file with the development database. Re-running preserves credentials; it refuses a different database or an unsafe role. Product processes use the runtime URL; migrations and synthetic fixture cleanup use the separate owner URL. Never export an owner `DATABASE_URL` into app processes: exported variables override environment files, and finance queries reject a privileged connection.

Open `/accounts` after joining a household. Enroll/verify an authenticator before creating an account. Creation records your self-declared sole adult ownership; a viewing grant does not make the other adult an owner. Accounts start private, even when another adult joins. An unknown value stays unknown until its owner records a dated manual GBP value. Liability values mean nonnegative outstanding debt. Account kinds and legal ownership cannot be changed through metadata edits.

The manual valuation API accepts optional `adultMoney` alongside original `money` and `asOfDate`. This owner attestation records the household adults' portion, not spendable cash. Omitted or null ownership stays unknown, including historical valuations; legal title does not imply adult ownership. Owners correct evidence with a new valuation using the existing version/idempotency controls. Positive portions must be within the original amount; overdrafts and liabilities require the full obligation. Archive reads and CSV balance details preserve both amounts. The current form does not attest ownership; an explicit control belongs to the later wealth screen.

`GET /v1/households/:householdId/wealth` returns the caller's visible manual GBP wealth. Optional `accountIds` is a comma-separated selection of one to fifty unique IDs; larger default scopes require selection. Unknown, missing, incomplete, future or over-30-day-old evidence is excluded and labelled; no contributing evidence returns null rather than zero. Known nonadult portions are excluded without inventing child profiles. Exact sorted account/valuation versions identify the evidence; permission or source changes during the read fail closed. Values-only consent permits these valuation totals, never ledger details. Pension/property are excluded from liquid assets, and liquid wealth is not an available-to-spend or goal-allocation calculation.

Owners can choose Private, Values only or Values and details for the other active adult. Widening access requires a TOTP proof from the last five minutes; the Security screen can request fresh verification. Downgrades take effect on the next request, invalidating old membership epochs and cursors. Viewing grants do not permit edits, valuation entry or re-sharing. Values and details also permits viewing booked activity and scoped reports. It never permits changing another owner's source records. Holdings remain future work.

Financial tables force PostgreSQL row-level security. Trusted server context is scoped to a transaction and rechecks the current user, membership, session and grant epoch. Tests connect as the restricted runtime role; they do not substitute table-owner queries as isolation evidence. There is no hosted Data API. Joint-owner confirmation and later financial features retain their own acceptance gates; archive and lifecycle controls are verified in Task 1.6. See [Task 1.3 design](docs/decisions/task-1.3-plan.md).

## Local CSV and manual activity

Run `pnpm imports:setup` before starting the API and worker. It generates a separate local encryption key in ignored `.env.imports` with restrictive permissions and preserves an existing valid key. Keep it with the database; replacing it makes retained originals unreadable. No key reaches the browser.

Open `/imports` for an owned account. CSV files must use UTF-8, a header row, at most 10 MiB and 50,000 transaction records. Choose columns, date order, decimal separator and sign explicitly. Review rejects and overlap warnings before committing. Equal purchases remain separate unless an explicit stable source identifier proves a duplicate. Preview originals expire after 24 hours; successful originals expire within seven days and can be deleted earlier.

Open `/activity` to add manual transactions, correct their financial details, classify owned activity and keep author-private notes. Imported financial fields retain their original source. Rollback is available only when an import has no later edits, classifications or notes; restore republishes the same transaction identities. Manually recorded account balances are not changed automatically by transaction activity. See [Task 1.4 decisions](docs/decisions/task-1.4-plan.md).

## Local spending, budgets and review

Open `/dashboard`, `/budgets` or `/review` and select the calendar month and accounts. Reports use only accounts with current **Values and details** access; an explicit unavailable selection fails instead of silently changing totals. Budgets belong to the exact selected-account scope. Either adult may edit its limits only while they can see every account in that scope. Limits do not change account balances.

Owners classify activity as spending, income, refund, transfer, debt service, principal, contribution or unclassified. Negative cash/card entries start as provisional spending; positive entries are never guessed as income. In transaction details, use exact splits to replace a parent amount or confirm equal opposite transfer legs in two accounts you own. Clear splits or remove a transfer link before changing financial fields. Card settlement must be excluded separately from the card purchase to avoid double counting. Refunds offset spending in their booked month.

History remains incomplete until owners confirm coverage for every selected account in a closed month and financial components are reviewed. An upload's date range does not prove complete history. Comparisons stay unavailable for incomplete periods. Charts include visible amount tables, and financial calculations retain exact GBP minor units beyond source-row limits.

The local PWA caches only its generic offline document and public icon. Offline navigation shows no financial figures; authenticated HTML, API responses, statements and credentials are never placed in CacheStorage. No production hosting or deployment is enabled. See [Task 1.5 decisions](docs/decisions/task-1.5-plan.md).

## Local privacy and recovery

After `pnpm auth:setup`, run `pnpm privacy:setup`. It creates ignored, private `.env.privacy` and `.env.privacy-worker` files plus `.local/privacy/deletion-ledger.ndjson`. Preserve this journal independently of every database backup. Setup preserves existing contents and refuses hosted Auth. Only the worker loads the new administrative Auth credential file. Do not use these synthetic credentials outside local development.

Open `/settings/privacy` to export selected authorised accounts, leave or request account deletion. Exports and deletion require a fresh authenticator proof. Values-only access exports account details and balances; detailed access includes published activity, corrections and the requester's own private notes. CSV text is escaped for spreadsheet safety. Downloads require the requesting session and unchanged permissions, expire after fifteen minutes, and encrypted objects expire after twenty-four hours. Retrying or resuming cannot bypass revocation. Already downloaded bytes cannot be recovered.

Leaving is available without a pre-exit export or partner approval. It revokes household access and requires a fresh sign-in. `/archive` then provides read/export-only access to recorded sole or verified joint ownership; former viewing grants and another author's private notes do not carry over. A former member cannot reactivate the original household membership; create a new household and explicitly import owned records instead. No automatic cross-household copy exists.

Deletion immediately revokes app access and returns a minimal status receipt in a purpose-bound HttpOnly cookie. The local worker verifies independent journal intent, purges eligible personal records and confirms upstream Auth deletion before reporting completion. Another recorded owner's source records remain; minimal UUID tombstones preserve justified shared history. Provider failure remains pending and retries. Keep the receipt browser until completion; lost or expired receipts need an independently verified local operator process, never partner approval. Safety controls remain free. Direct connection disconnection stays disabled because this build has no bank/broker connections.

The recovery rehearsal and its limitations are documented in [the local restore runbook](docs/runbooks/restore.md). Production backup automation, legal retention review, vendor approval and production recovery objectives remain future gates. **No deployment, preview, staging, deployment hook or hosted database is authorised until the entire MVP is complete and the founder explicitly approves deployment.**

Clerk development authentication: add the selected application's development keys to ignored `.env`, then run `pnpm auth:clerk:setup`. Follow the [local setup and migration guide](docs/joint-app/clerk-local-setup.md), including the existing-account linking and independent privacy-journal requirements. No deployment or tunnel is part of setup.
