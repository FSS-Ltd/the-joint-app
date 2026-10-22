# The Joint App

Household finance built around shared goals and individual privacy. **In development: repository foundation only.**

## Local setup

Use Node 22.23.3 and pnpm 10.6.5. Start Docker Desktop, then:

```sh
cp .env.example .env
pnpm install --frozen-lockfile
pnpm db:up
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

If port 5432 is occupied, set POSTGRES_PORT=15432 and update DATABASE_URL in .env. Export DATABASE_URL for integration tests when using a custom port.

Integration tests require local PostgreSQL. Browser tests require the built web app and start it automatically. Root `.env` is loaded by API/worker start commands; tests accept DATABASE_URL from the process or use synthetic defaults.

## Structure and delivery

- apps/web: Next.js introduction page.
- apps/api: NestJS health endpoints.
- apps/worker: independent database monitoring process.
- packages/contracts: health schemas and environment validation.
- packages/database: bounded database connectivity.
- packages/config: shared TypeScript settings.
- docs/joint-app: sanitised product/build specifications.

See [bootstrap decisions](docs/decisions/bootstrap.md), [progress](docs/progress.md) and [version matrix](docs/decisions/version-matrix.md).

Repository visibility is temporarily public for Actions usage. No open-source licence is granted. The original local plan and all environment secrets are excluded from Git. Authentication, finance and integrations are not implemented.
