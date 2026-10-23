# The Joint App

Household finance built around shared goals and individual privacy. **In development: local foundation and authenticated bootstrap only.**

## Local setup

Use Node 22.23.3 and pnpm 10.6.5. Start Docker Desktop, then:

```sh
cp .env.example .env
pnpm install --frozen-lockfile
pnpm db:up
pnpm build
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Web: http://127.0.0.1:3000. API: http://127.0.0.1:3001/health/live and /health/ready. PostgreSQL: loopback port 5432. Local credentials are disposable development defaults, never production credentials.

Run apps separately with `pnpm --filter @joint/web dev`, `pnpm --filter @joint/api dev`, and `pnpm --filter @joint/worker dev`. Build shared packages first with `pnpm build`. Production builds start with the package's `start` script; the worker has no queue handlers yet. Stop with Ctrl-C.

`pnpm db:down` preserves the Docker volume. Do not delete volumes containing wanted data.

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

If port 5432 is occupied, set POSTGRES_PORT=15432 and update DATABASE_URL in .env. Root integration/browser commands load `.env` automatically; exported environment variables take precedence.

Integration and browser tests require migrated local PostgreSQL and built packages. Browser tests start the web app automatically and bind their synthetic API on port 3001; stop a running development API before testing. Root `.env` is loaded by API/worker start and root integration/browser commands. CI uses its synthetic PostgreSQL service. Type checking builds package declarations first and also checks test sources.

## Structure and delivery

- apps/web: Next.js introduction page.
- apps/api: NestJS health endpoints and a JWT/JWKS-verified bootstrap read.
- apps/worker: independent local process and bounded job runner; no CSV handlers yet.
- packages/contracts: health schemas and environment validation.
- packages/database: bounded connectivity, Prisma migrations and durable Job/Outbox storage.
- packages/config: shared TypeScript settings.
- docs/joint-app: sanitised product/build specifications.

See [bootstrap decisions](docs/decisions/bootstrap.md), [progress](docs/progress.md) and [version matrix](docs/decisions/version-matrix.md).

Repository visibility is temporarily public for Actions usage. No open-source licence is granted. The original local plan and all environment secrets are excluded from Git. The authentication boundary is tested with ephemeral synthetic identities; sign-in, MFA, invitations, finance and integrations are not implemented.

All application execution/data remain local until the MVP is complete and the founder explicitly approves deployment. No hosted previews, staging, production, deployment hooks or cloud app/database provisioning before that approval. GitHub source delivery and synthetic CI remain authorised. Existing Vercel Pro and a free database are future hosting targets only.

See [Task 1.1 design and limits](docs/decisions/task-1.1-plan.md) for queue semantics and the fail-closed bootstrap. Optional `AUTH_ISSUER` configures an asymmetric Supabase-compatible issuer; without it the bootstrap API returns 401. No static test token or development sign-in bypass exists. The local seed creates only two synthetic households, not usable login sessions. `GET /api/bootstrap` forwards an existing server-held access cookie to the fixed API; cookie issuance and refresh are Task 1.2.
