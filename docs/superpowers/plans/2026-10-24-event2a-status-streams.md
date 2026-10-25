# EVENT2A — Authenticated status streaming transport

Implement inline, with TDD and one fresh-context whole-branch review. This is the
server transport half of EVENT2. EVENT2B will replace the import/export/deletion
browser polling only after this PR has green current-revision CI and is merged.
The full event conversion and broader home/goals work remain in scope and unfinished.

## Authority and boundaries

Base: host-verified EVENT1 PR28 merge `f2d6f47a0f78242fcc034ab2db5d3b5fcbaa4606`.
The user requires subscriptions instead of recurring state-discovery queries.
Retain existing import ownership, export source fences, household/archive contexts,
Clerk/local authentication, receipt cookies and deletion journal safeguards. No
deployment, tunnel, paid service, new dependency or visual redesign is authorised.
Design-craft applies to the later consumer feedback; its backend-only exclusion
applies here. The approved forest/ivory rectangular/glass baseline remains unchanged.

## Design

Add a dedicated empty-payload PostgreSQL status channel and meaningful row triggers
for import/export/deletion state, permission/identity revocation and source revisions.
Ignore auth bookkeeping/token-refresh fields so reauthorization cannot notify itself
forever. Reuse EVENT1's tested session listener through a fixed-topic internal helper;
keep its worker entry point and semantics intact. One API hub owns one listener.

`GET /v1/events` accepts a strict resource selector for import, household export,
owner archive export or deletion receipt. Subscribe before the initial authoritative
read, then reconcile after listener reconnect. Each hint repeats existing identity
and resource authorization. Compare server-only fingerprints; emit only empty
`change`, `invalidate`, `renew` or `reconnect` frames, never rows, IDs, credentials,
financial values or error details. Events grant no authority. A failed recheck ends
the stream safely. Coalesce hints while a read is active; do not keep transactions
open while streaming. Heartbeat comments do not query the database.

Schedule actual credential/receipt expiry and relevant resource expiry; no recurring
reconciliation timer. Each identity adapter exposes an internal expiry read using its existing verified
session context; bearer expiry also bounds the authenticated session deadline. An expiry renews or invalidates the connection, allowing the later client
to obtain a fresh credential and catch up. A small service-only receipt-deadline
function returns an expiry only for the existing matching unexpired receipt hash.
It preserves RLS and has a fixed search path and runtime-only execution.

The BFF exposes session streams at `/api/events` and receipt streams beneath the
existing `/api/privacy` cookie path. Reuse the receipt parser, reject duplicate or
unknown selector fields and cross-site requests, attach credentials only server-side,
and forward bounded streaming data without buffering. Sanitize the restricted empty
frame protocol rather than passing unexpected upstream fields or comments through. Bound the handshake, propagate
browser cancellation upstream and remove listeners/timers on close. Limit active API
streams and destroy a backpressured connection rather than accumulating output.
API shutdown closes active streams and the listener before releasing database pools.

## Delivery tasks and acceptance

1. Add failing behavioral tests for commit/reconnect-driven resource observers,
   duplicate suppression, unchanged idle read counts, reauthorization/invalidation,
   expiry, output backpressure, unsubscribe and API shutdown. Implement focused
   hub, observer and HTTP streaming modules with injectable existing resource reads.
2. Test meaningful committed notifications and rollback silence, ignored auth
   bookkeeping, scoped imports/exports, cross-household/account denial, revoked
   sessions/memberships/grants and purpose-bound receipt isolation/expiry. Add the
   migration, typed selector, shared listener and authority adapters. Reuse existing
   service queries; expose no privileged database rows through the stream.
3. Add BFF transport regressions for both auth modes, cookie scope, malformed and
   duplicate queries, redirects, cancellation, safe failures and bounded handshake.
   Implement routes without changing the existing browser consumers yet. Document
   direct/session connection requirements, migration ordering and remaining EVENT2B.
4. Verify exact secret-free source with frozen install, format, lint, package/test
   types, units, all integration, browser acceptance and builds. Inspect every changed
   file and diff. Request one independent whole-branch review, resolve important
   findings with RED/GREEN regressions, and repeat affected checks. Scan public files.
   Publish only after local verification; verify final-head/actual-test-merge CI,
   protections/reviews/conversations and authorised host merge. Record exact proof.

## Recovery and edge cases

The migration adds triggers and a read-only function; it rewrites no business data.
Apply it before starting the stream-enabled API. A previous API ignores the additional
notifications, so code rollback can leave the additive database objects in place.
Transaction pooling cannot support LISTEN; retain a direct/session connection.
No hosted runtime compatibility is claimed before deployment acceptance.

- Changes committed between subscription and initial read must be observed or
  coalesced into a subsequent read, including changes made during authorization.
- Credential expiry without any data change must end the stream on time, while
  receipt status remains independent of a deleted browser session.
- Listener failure, slow consumers and browser/API shutdown must release all
  subscriptions and connections without exposing financial or exception data.
- Permission changes affecting a terminal import/export must still invalidate its
  stream. Expired deadlines must not create a tight re-read loop.
- Existing auth refresh/last-seen writes must not generate idle status queries.
