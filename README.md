# The Joint App

Household finance built around shared goals and individual privacy. **In development: local identity, household membership and private manual accounts. CSV imports and financial reporting remain future steps.**

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
pnpm dev
```

Web: http://127.0.0.1:3000. API: http://127.0.0.1:3001/health/live and /health/ready. PostgreSQL: loopback port 5432. Local credentials are disposable development defaults, never production credentials. Auth is loopback http://127.0.0.1:15421/auth/v1; its development email inbox is http://127.0.0.1:15424. No messages leave the local inbox.

Run apps separately with `pnpm --filter @joint/web dev`, `pnpm --filter @joint/api dev`, and `pnpm --filter @joint/worker dev`. Build shared packages first with `pnpm build`. Production builds start with the package's `start` script; the worker has no queue handlers yet. Stop with Ctrl-C.

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

If port 5432 is occupied, set POSTGRES_PORT=15432 and update DATABASE_URL in .env. Root integration/browser commands load `.env`, `.env.database` and `.env.auth` automatically; exported environment variables take precedence.

Integration and browser tests require migrated local PostgreSQL and built packages. Browser tests start the web app automatically and bind their synthetic APIs on ports 3001, 3302 and 3402, plus isolated identity/account web processes on 3301 and 3401; stop development processes on those ports before testing. The API and worker load `.env.database` after `.env`; the API also loads `.env.auth`. CI uses disposable PostgreSQL, Auth and email containers with synthetic identities. Type checking builds package declarations first and also checks test sources.

## Structure and delivery

- apps/web: Next.js introduction, identity/household onboarding and mobile-first manual accounts.
- apps/api: NestJS health, server-owned identity/session and household/invitation and private account/grant endpoints.
- apps/worker: independent local process and bounded job runner; no CSV handlers yet.
- packages/contracts: validated health, identity, household, account and exact-Money interfaces plus environment validation.
- packages/database: bounded connectivity, Prisma migrations and durable Job/Outbox storage.
- packages/domain: exact GBP input and display helpers; no floating-point money arithmetic.
- packages/config: shared TypeScript settings.
- docs/joint-app: sanitised product/build specifications.

See [bootstrap decisions](docs/decisions/bootstrap.md), [progress](docs/progress.md) and [version matrix](docs/decisions/version-matrix.md).

Repository visibility is temporarily public for Actions usage. No open-source licence is granted. The original local plan and all environment secrets are excluded from Git. Authentication uses the maintained Supabase Auth server locally. CSV handling, reports and integrations remain future steps.

All application execution/data remain local until the MVP is complete and the founder explicitly approves deployment. No hosted previews, staging, production, deployment hooks or cloud app/database provisioning before that approval. GitHub source delivery and synthetic CI remain authorised. Existing Vercel Pro and a free database are future hosting targets only.

See [Task 1.1 design and limits](docs/decisions/task-1.1-plan.md) for queue semantics and [Task 1.2 identity design](docs/decisions/task-1.2-plan.md) for sessions and membership.

## Local identity

Open `/sign-up`, create a synthetic individual account and copy its six-digit confirmation code from the local inbox. Each adult uses a separate email/password. Create a household or explicitly accept an invitation addressed to your verified email. Invitations expire after seven days; creating another replaces any pending invitation. Share the one-use link manually; the app sends no external invitations. Joining a household does not grant access to private financial accounts.

Open `/security` to enroll and verify a TOTP authenticator. A later sign-in requires the enrolled factor before household actions. `/recovery` sends a local email code and requires an existing authenticator when enrolled. A successful password reset keeps its current browser session and revokes other app sessions. Local/global logout revokes server registry entries immediately, independently of JWT expiry; logout reloads the page. Lost-authenticator support and production recovery operations remain release gates; there is no partner override.

`pnpm auth:setup` creates ignored `.env.auth` with restrictive file permissions and generated local signing/encryption keys. Existing settings are preserved. Keep that file with its development volumes: replacing its encryption key makes stored provider sessions unreadable, and replacing its signing keys invalidates local Auth credentials. Never commit it, copy its test admin key into app configuration, or use its keys/data outside local development. Configure a different Auth HTTP port before initial setup using `AUTH_HTTP_PORT`; keep issuer, gateway and signed local keys consistent.

Only random opaque session cookies reach the browser; provider access/refresh tokens stay encrypted in PostgreSQL. Mutation requests require matching Origin and CSRF proof. The loopback synthetic inbox allows up to 1,000 Auth emails/hour with a one-second resend cooldown so repeated test runs do not exhaust the vendor default. This is not a production abuse-protection configuration. Real Auth integration tests require `pnpm auth:up`, migrated application data and built packages. No hosted Supabase project is provisioned.

The seed creates two synthetic households without usable login sessions. The earlier bootstrap test route verifies a signed bearer session and membership; the identity UI uses `/api/me` with the opaque session cookie.

## Local private accounts

Run `pnpm db:runtime` after migrations and before starting the API/worker or tests. It creates a restricted local login and ignored `.env.database` with random runtime credentials plus the maintenance URL. Preserve this file with the development database. Re-running preserves credentials; it refuses a different database or an unsafe role. Product processes use the runtime URL; migrations and synthetic fixture cleanup use the separate owner URL. Never export an owner `DATABASE_URL` into app processes: exported variables override environment files, and finance queries reject a privileged connection.

Open `/accounts` after joining a household. Enroll/verify an authenticator before creating an account. Creation records your self-declared sole adult ownership; a viewing grant does not make the other adult an owner. Accounts start private, even when another adult joins. An unknown value stays unknown until its owner records a dated manual GBP value. Liability values mean nonnegative outstanding debt. Account kinds and legal ownership cannot be changed through metadata edits.

Owners can choose Private, Values only or Values and details for the other active adult. Widening access requires a TOTP proof from the last five minutes; the Security screen can request fresh verification. Downgrades take effect on the next request, invalidating old membership epochs and cursors. Viewing grants do not permit edits, valuation entry or re-sharing. Values and details is a permission tier; transaction/holding records and CSV imports are not implemented yet.

All four finance tables force PostgreSQL row-level security. Trusted server context is scoped to a transaction and rechecks the current user, membership, session and grant epoch. Tests connect as the restricted runtime role; they do not substitute table-owner queries as isolation evidence. There is no hosted Data API. Joint-owner confirmation, archive/lifecycle flows and later financial features retain their own acceptance gates. See [Task 1.3 design](docs/decisions/task-1.3-plan.md).
