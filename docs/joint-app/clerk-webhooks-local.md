# Clerk webhooks during local development

The API handler is `POST http://127.0.0.1:3001/v1/webhooks/clerk`.
It is a local address, not a publicly reachable Clerk Dashboard endpoint. Keep
the Dashboard endpoint unset while testing with signed fixtures. No deployment,
public relay or temporary tunnel is approved.

The handler requires Clerk mode, the configured issuer, a server-only
`CLERK_WEBHOOK_SIGNING_SECRET` and the matching `CLERK_WEBHOOK_INSTANCE_ID`.
Missing endpoint configuration fails closed. Local fixtures use independent
synthetic signing secrets and instance IDs; they do not provision a live endpoint.
Never paste a signing secret into source, an issue, a PR or chat.

The integration suite in `tests/clerk-webhooks.integration.ts` sends signed raw
HTTP fixtures through the real handler. It covers the 64KiB limit, signatures,
timestamp freshness, instance matching, concurrent duplicates, terminal-state
ordering, JIT registration races and restricted database access. It must run
against a migrated disposable test database, not a reset development database.

When a public endpoint is separately authorized, subscribe to `user.created`,
`user.updated`, `user.deleted`, `session.created`, `session.ended`,
`session.removed` and `session.revoked`. Use that endpoint's real signing secret
in ignored server configuration. Public delivery remains unverified until then.

Webhooks reconcile authentication state. They do not deliver email verification
codes: Clerk's email verification flow does that. They do not grant household or
account permissions, and provider user deletion does not directly delete retained
financial records. The existing journaled application deletion policy still
controls that lifecycle.
