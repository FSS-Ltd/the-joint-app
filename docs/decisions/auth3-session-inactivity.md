# AUTH3 — Session inactivity

The user selected a ten-minute inactivity limit. Existing absolute and provider session limits still apply. Expiry requires fresh authentication; there is no Continue-to-account action.

`SessionRegistry.lastSeenAt` records explicit interaction. PostgreSQL checks it under the session row lock before accepting activity; an expired or revoked session cannot renew. Read-only requests, provider token refresh, stream traffic and worker activity do not update it. Existing rows retain their timestamps and may require fresh sign-in after the migration. No schema columns or backfill are needed.

The authenticated session endpoint returns only the effective expiry and database time. Its mutation accepts a strict `activityAgeMs` integer from 0 to 5000, which deducts input batching delay. The BFF uses the existing session transport, CSRF checks, response validation and no-store headers. Activity cannot change MFA proof, purpose, permissions or another session.

The browser listens to trusted deliberate input. It coalesces active input into at most one activity mutation per five seconds per tab, with a trailing request only when additional input exists. Each mutation uses the existing CSRF bootstrap. Idle pages send neither activity mutations nor recurring session reads. A single deadline timer reconciles once at expiry, concealing protected content first. Startup, reconnect and visibility restoration reconcile without treating those lifecycle events as activity. Active forms remain mounted while their known deadline is valid; expired or failed authority removes protected content. BFCache entry conceals content before caching.

Committed-activity hints contain no user, account, household or credential information. A receiving tab authenticates its own session before accepting a deadline. Session-change messages remain separate and reconcile browser authentication even when an inner screen is absent. Subscriptions retain their own server expiry checks. Durable jobs keep their existing lease and authorization model.

Logout uses existing local revocation, provider sign-out and cleanup retry. Already-unauthorized responses still clear the browser provider session before fresh sign-in. Failed cleanup cannot reveal the protected screen. Invitations remain available before authentication. Clerk pending MFA/password tasks and session-independent deletion receipts keep their existing flows.

Verification uses disposable PostgreSQL, signed synthetic Clerk responses, disposable local Auth accounts, fake-clock controller tests and owned headless browser tests. No production deployment, temporary tunnel, paid service or hosted Clerk configuration change is part of this step.

Rollback is a forward fix. Do not restore old scope definitions to bypass the inactivity policy. A genuine new provider sign-in creates a new application session; extending an expired session is deliberately unsupported.
