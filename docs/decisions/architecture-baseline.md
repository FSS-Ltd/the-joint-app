# Task 0.4 — Architecture baseline

Decision date: 23 October 2026. Safe local/synthetic implementation baseline; no production resources or auth flow claimed implemented. Read [current product scope](../joint-app/01-product-specification.md) and [version matrix](version-matrix.md).

## Application boundaries

Keep the existing TypeScript modular monolith: Next.js web, NestJS REST API and independent worker. Shared Zod contracts and pure domain functions have no database/secrets dependency in browser bundles. Prisma owns app-schema migrations when introduced; do not add competing Supabase migration history. The Supabase skill's CLI migration preferences do not override the repository's explicit Prisma history requirement.

CSV/manual records are the MVP data source. Live bank connectors and bank procurement are post-MVP. No broker API development until its separate written-permission gate passes. Child profiles are post-MVP; parent-balance duplication and verified child-earmark exclusions still need correct handling. Money stays BigInt minor units, serialised as decimal strings; rates/holdings use explicit decimal arithmetic.

Use mobile-first UI with the [reference synthesis](design-direction.md), not a desktop dashboard shrunk onto a phone. Do not add providers, fake figures or unimplemented navigation to create visual fullness.

## Web auth/BFF decision

Use maintained Supabase Auth with server-mediated web sessions. Web login/callback/refresh handlers retain tokens in Secure, HttpOnly, SameSite=Lax cookies; never localStorage. A same-origin, fixed-upstream BFF checks origin/CSRF for mutations and forwards the access token to Nest. No competing browser refresh client. Serialize refresh per session, handle multi-tab races and use no-store finance responses.

This is a deliberate server-only policy, not Supabase's default browser-assisted SSR design. The [SSR advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide) discusses browser access to refresh tokens; do not claim the standard examples prove our cookie/refresh properties. Use explicit server storage/cookie handling and validate the exact SDK behaviour in Task 1.2. If it cannot meet the policy, resolve an ADR before changing it.

Nest validates signature/JWKS, issuer, audience, expiry, subject and session identifier. Resolve membership/account grants from server-side data, not user-editable metadata. A live application session registry enforces immediate revocation independently of JWT expiry. Distinguish local/global logout, recent reauthentication and MFA. No service-role key in a public client; billing/household admin never overrides private account access.

Later native auth uses maintained Supabase client refresh with platform SecureStore and in-memory access tokens. It calls the same Nest boundary with bearer tokens. Native redirects, session refresh, revocation and physical-device flows remain native-phase acceptance checks.

## Database and region decision

For deployed primary application/data use London eu-west-2; [Supabase lists it as a specific region](https://supabase.com/docs/guides/platform/regions). Choose that exact region, not the general Europe grouping. No cloud project exists from this work, so region, selected plan/features, network rules and actual data flow are not operationally verified.

Long-lived API/worker processes use direct Postgres or session pooling as appropriate to network support; migration access is separate. [Connection/pool guidance](https://supabase.com/docs/guides/database/connecting-to-postgres) must be validated with Prisma when introduced. Use transaction-local server-derived tenant/user scope and real least-privilege runtime roles, never a table-owner/superuser role for normal requests. The unexposed app schema gets forced RLS and tenant-matched constraints; no public/anon/authenticated finance-table grants. Test pooled context isolation and direct Data API non-exposure.

[Supabase backups](https://supabase.com/docs/guides/platform/backups) document daily backups for paid plans and seven days of access on Pro. Database backups exclude Storage object bytes and custom-role passwords. Retain a separate object/key/config recovery plan and test restore/deletion-ledger replay before real data. Actual selected-plan/PITR costs and restore evidence remain launch gates; free local development is not a production backup plan.

London primary data is not a guarantee that all logs, support, subprocessors or exports stay in the UK. Record real vendor flows before deployment; region selection alone does not prove compliance.

## Local AI boundary and disposition

An installed local runtime completed a synthetic short-prompt smoke; see [benchmark plan/evidence](local-ai-benchmark-plan.md). This is not the full Phase 4 evaluation, device-owner consent, a promise of uptime or a measured peak-memory budget. No cloud fallback. Core CSV/manual finance and deterministic projections remain independent of model availability.

Task 0.4 supplies an explicit baseline and measured limits for safe independent work. The exact auth/ORM/native integration, real cloud configuration, full model identity/quality/saturation benchmark and per-adult device evidence remain their relevant implementation/release gates. No claims of completed production auth, native app, deployment or AI companion.
