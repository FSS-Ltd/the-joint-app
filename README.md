# The Joint App

Household finance built around shared goals and individual privacy. **In development: local identity, household membership and infrastructure. Financial features are not implemented.**

## Local setup

Use Node 22.23.3 and pnpm 10.6.5. Start Docker Desktop, then:

```sh
cp .env.example .env
pnpm install --frozen-lockfile
pnpm db:up
pnpm auth:up
pnpm build
pnpm db:migrate
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

If port 5432 is occupied, set POSTGRES_PORT=15432 and update DATABASE_URL in .env. Root integration/browser commands load `.env` and `.env.auth` automatically; exported environment variables take precedence.

Integration and browser tests require migrated local PostgreSQL and built packages. Browser tests start the web app automatically and bind their synthetic APIs on ports 3001 and 3302, plus an isolated identity web process on 3301; stop development processes on those ports before testing. The worker loads `.env`; the API also loads `.env.auth`. CI uses disposable PostgreSQL, Auth and email containers with synthetic identities. Type checking builds package declarations first and also checks test sources.

## Structure and delivery

- apps/web: Next.js introduction, individual sign-in/recovery/MFA and household onboarding.
- apps/api: NestJS health, server-owned identity/session and household/invitation endpoints.
- apps/worker: independent local process and bounded job runner; no CSV handlers yet.
- packages/contracts: validated health, identity and household interfaces plus environment validation.
- packages/database: bounded connectivity, Prisma migrations and durable Job/Outbox storage.
- packages/config: shared TypeScript settings.
- docs/joint-app: sanitised product/build specifications.

See [bootstrap decisions](docs/decisions/bootstrap.md), [progress](docs/progress.md) and [version matrix](docs/decisions/version-matrix.md).

Repository visibility is temporarily public for Actions usage. No open-source licence is granted. The original local plan and all environment secrets are excluded from Git. Authentication uses the maintained Supabase Auth server locally. Finance, CSV handling and integrations remain future steps.

All application execution/data remain local until the MVP is complete and the founder explicitly approves deployment. No hosted previews, staging, production, deployment hooks or cloud app/database provisioning before that approval. GitHub source delivery and synthetic CI remain authorised. Existing Vercel Pro and a free database are future hosting targets only.

See [Task 1.1 design and limits](docs/decisions/task-1.1-plan.md) for queue semantics and [Task 1.2 identity design](docs/decisions/task-1.2-plan.md) for sessions and membership.

## Local identity

Open `/sign-up`, create a synthetic individual account and copy its six-digit confirmation code from the local inbox. Each adult uses a separate email/password. Create a household or explicitly accept an invitation addressed to your verified email. Invitations expire after seven days; creating another replaces any pending invitation. Share the one-use link manually; the app sends no external invitations. Joining a household does not grant access to private financial accounts.

Open `/security` to enroll and verify a TOTP authenticator. A later sign-in requires the enrolled factor before household actions. `/recovery` sends a local email code and requires an existing authenticator when enrolled. A successful password reset keeps its current browser session and revokes other app sessions. Local/global logout revokes server registry entries immediately, independently of JWT expiry; logout reloads the page. Lost-authenticator support and production recovery operations remain release gates; there is no partner override.

`pnpm auth:setup` creates ignored `.env.auth` with restrictive file permissions and generated local signing/encryption keys. Existing settings are preserved. Keep that file with its development volumes: replacing its encryption key makes stored provider sessions unreadable, and replacing its signing keys invalidates local Auth credentials. Never commit it, copy its test admin key into app configuration, or use its keys/data outside local development. Configure a different Auth HTTP port before initial setup using `AUTH_HTTP_PORT`; keep issuer, gateway and signed local keys consistent.

Only random opaque session cookies reach the browser; provider access/refresh tokens stay encrypted in PostgreSQL. Mutation requests require matching Origin and CSRF proof. The loopback synthetic inbox allows up to 1,000 Auth emails/hour with a one-second resend cooldown so repeated test runs do not exhaust the vendor default. This is not a production abuse-protection configuration. Real Auth integration tests require `pnpm auth:up`, migrated application data and built packages. No hosted Supabase project is provisioned.

The seed creates two synthetic households without usable login sessions. The earlier bootstrap test route verifies a signed bearer session and membership; the identity UI uses `/api/me` with the opaque session cookie.
