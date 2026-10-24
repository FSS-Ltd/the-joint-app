# EVENT1 — Worker wakeups and due-time scheduling

Implement in the current session, with one fresh-context whole-branch review.

## Scope and authority

Replace the worker's ten-second database scan with PostgreSQL commit notifications
and one-shot timers for durable deadlines. This implements the user's event-driven
standard; browser status subscriptions remain a separate gated EVENT2 unit.
Preserve all job leases, handler authorization, deletion fences and maintenance
bounds. No deployment, paid service, browser event endpoint or dependency is added.
Base: host-verified UI7 PR27 merge `f9948fdc2ee79d6843454277a813330d1db96985`.

## Design

A dedicated authenticated `pg.Client` subscribes to a static channel with an empty
payload. Row triggers notify only on scheduling-relevant changes. PostgreSQL emits
notifications after commit and discards rolled-back notifications. No tenant IDs,
financial records, credentials or exception text enter the channel or logs.
LISTEN completes before startup/reconnect reconciliation, following PostgreSQL's
[initial listener rule](https://www.postgresql.org/docs/17/sql-listen.html) and
[transaction semantics](https://www.postgresql.org/docs/17/sql-notify.html).

The worker serializes and coalesces wakeups. Each bounded cycle retains existing
maintenance and job processing, then asks a restricted security-definer function
for the next actionable deadline. It includes job retries/expired leases, import
object/preview expiry, failed import reconciliation, export expiry/chunk cleanup
and configured deletion retries. Disabled handler/provider work cannot cause a
busy loop. Timers schedule actual deadlines; idle workers perform zero queries.
Database failures use bounded exponential reconnect/retry backoff, separately from
normal updates. Hints received during failure cooldown coalesce until its deadline.
If a settled cycle still sees overdue work without a pending hint, it waits one
second before retrying: SKIP LOCKED may hide a currently locked candidate. Hints
also coalesce during that cooldown. This caps that contention path at one bounded
cycle/second; productive hint-driven drains continue immediately. This is known due
work, not a periodic idle reconciliation fallback. Long timers are chunked without repeated database reads.

The additive migration creates notification triggers, scheduling indexes and a
read-only deadline function with fixed search path and runtime-only execution.
It neither rewrites business data nor changes existing RLS/authorization. Apply
migrations before restarting the worker. Recovery is a forward fix or the previous
worker with its old interval; database triggers may remain while rolling back code.
Requires a direct/session PostgreSQL connection, not transaction pooling.

## Tasks and verification

1. Add failing scheduler tests for idle queries, due timers, coalescing, errors,
   long deadlines and graceful shutdown. Implement a small scheduler module.
2. Add database integration tests for committed/rolled-back/duplicate notifications,
   reconnect catch-up, actual due queries and maintenance backlog. Implement the
   dedicated listener, restricted deadline query and additive migration. Exercise
   runtime permissions and preserve tenant/lease fences through existing suites.
3. Wire the worker lifecycle; replace `WORKER_INTERVAL_MS` with bounded
   `WORKER_RETRY_MAX_MS` (default 30000, range 1000–60000). Initial retry is 1000ms.
   Reopen every changed file and self-review. Run frozen installation, formatting,
   lint, type checks, units, all database integration, browser acceptance and builds
   against a secret-free source archive and disposable PostgreSQL fixture.
4. Request one independent whole-branch review. Resolve important findings with
   regression evidence. Scan public files, publish EVENT1 PR only after local
   checks, verify final-head/test-merge CI and compliant authorised merge. Record
   checked revisions and host merge proof before starting EVENT2.

No periodic reconciliation fallback is proposed. Startup/reconnect each performs
one catch-up cycle. One settled cycle performs bounded maintenance, up to ten jobs,
one deletion attempt and one deadline query. Notifications are hints, never access
grants; existing durable claims and scoped handlers remain authoritative.
