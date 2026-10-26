# Goal allocations — Task 3C.4

Implementation is in local verification. The build unit is not complete until its
own PR passes current CI and is host-confirmed merged. Nothing is deployed.

## Routes and authority

| Method | Route                                                   | Result                              |
| ------ | ------------------------------------------------------- | ----------------------------------- |
| GET    | `/v1/households/:householdId/goals/:goalId/allocations` | Controlled view and bounded history |
| PUT    | Same active route                                       | Versioned controlled view           |
| GET    | Active route plus `/export`                             | Free JSON history page, fresh MFA   |
| GET    | `/v1/me/archive/goals/:goalId/allocations`              | Frozen owner view and history       |
| GET    | Archive route plus `/export`                            | Free frozen JSON page, fresh MFA    |

Every successful response uses `Cache-Control: no-store`. Export responses use a
fixed `goal-allocations.json` attachment name. Archive routes have no writer.

Reads and exports require `accountIds`, a comma-separated selection of one to
fifty distinct UUIDs. An optional opaque `cursor` continues history. Undeclared
query fields, duplicate IDs and malformed cursors are rejected. UUID case and
selection order are normalized. Each page contains at most fifty revisions.
Cursors bind the actor, session, active/archive mode, active membership/grant
version, goal and complete source selection; they never confer access.

Active access requires current source ownership and existing goal participation.
A viewing grant or household membership alone does not control a source. The
entire selection is authorized before any amounts or history are returned.
Archive access requires both frozen source-owner and goal-participant rights.
Later co-owner changes cannot appear in a departed owner's archive. Archive
positions are explicitly unavailable rather than expose another adult's live
availability. Exports require normal authorized sessions and MFA within five
minutes, checked before and after the read, and stay free after a downgrade.

## Scoped replacement

PUT requires a UUID `Idempotency-Key` and quoted goal metadata `If-Match`, for
example `If-Match: "1"`. The strict body contains:

- `accountIds`: one to fifty distinct selected controlled sources.
- `sourceVersions`: exactly one `{accountId, version}` per selected source, using
  the private allocation counters returned by GET. Zero means no recorded change.
- `allocations`: at most one FIXED or FRACTION intention per selected source.
  Omitting an intention within the selection releases it. Unselected sources are
  unchanged, including another adult's intentions.

FIXED intentions contain `basis`, `accountId`, `valuationId` and
`amount: {amountMinor: "30000", currency: "GBP"}`. This is a synthetic example;
amounts are exact nonnegative signed-64-bit integer strings, never floating point.
FRACTION intentions replace `amount` with a canonical decimal `fraction`, such as
`"0.25"`, greater than zero and at most one with at most twelve decimal places.
Both forms retain the immutable named valuation.

Goal metadata versions and source allocation counters are separate. Allocation
writes change neither account balances/valuations nor the goal metadata version.
All selected replacements commit together under canonical source locks. All live
claims across goals count against each selected source's available funding.
Current eligibility requires a complete eligible manual adult GBP valuation,
matching settled/reserve evidence and a valuation age of zero to thirty London
calendar days. Availability clamps settled money minus reserves at zero. Historic
fractions use their original settled valuation and exact HALF_UP rounding.
Falling valuations preserve underfunded intentions; safe reductions and releases
remain possible. Unavailable sources allow release, not new commitments.
Unverified dormant rows block admission safely and are never assigned invented
provenance.

An exact replay returns the original versioned view without another change,
audit or hint. Source ordering, UUID case and key case are canonicalized for its
encrypted digest. Different details with the same key conflict. Live source,
goal and session authority are checked before opening replay. A replay describes
the original outcome; GET reconciles the current state and provides paged history.
No session-bound history cursor is stored in a write replay.

## Lifecycle, events and errors

Goal archive atomically releases verified intentions. Last-owner exit or source
archive releases active verified claims after preserving applicable exit cutoffs.
Privacy purge and isolated journal restore retain only independently justified
source/goal history and preserve exact surviving timestamps. No money moves.

Committed allocation, funding-evidence and goal-revision changes emit empty
PostgreSQL status wake hints. Reads, unchanged intentions, exact replays and
rollbacks produce no allocation hint. Hints contain no identifiers, amounts or
credentials. This API adds no recurring polling. Allocation screens and their
specific authenticated subscription registration remain Phase 3 Task E; freshness
is assessed on demand in this backend unit.

| Status/code                        | Meaning                                          |
| ---------------------------------- | ------------------------------------------------ |
| 400                                | Invalid input, headers, selection or cursor      |
| 401                                | Authentication/session unavailable               |
| 403 `MFA_REAUTH_REQUIRED`          | Verify the authenticator again for export        |
| 404                                | Unavailable source, goal, membership or control  |
| 409 `VERSION_CONFLICT`             | Refresh goal/source versions                     |
| 409 `IDEMPOTENCY_CONFLICT`         | Request key was used for different details       |
| 409 `FUNDING_UNAVAILABLE`          | Current eligible funding evidence is unavailable |
| 409 `ALLOCATION_EXCEEDS_AVAILABLE` | Reduce the intention or release a commitment     |

Responses do not include SQL exceptions, host information or connection strings.
Contributions, scenarios, projections and their UI are later delivery units.
