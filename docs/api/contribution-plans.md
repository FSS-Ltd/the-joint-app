# Shared contribution plans — Task 3C.5

This API saves **manual future intentions in GBP**. It does not infer income,
reserve account assets, change balances or transactions, transfer money, or
place investments. The projection engine and contribution screens are later
build units. No contribution change has been applied to personal local storage.

## Capacity and requests

One household budget captures the active adult memberships when its first
capacity is confirmed. Captured adults may edit it; later members do not inherit
it. A goal can join the budget only when every active budget participant already
has rights to that goal. Narrowing any included goal's rights hides the whole
budget, including history and version conflicts. Shared intent never grants
access to a source account.

Capacity consists of `firstContributionDate`, `horizonMonths` and
`monthlyContributions`. Dates must be calendar month-ends; the 1–600 month window
must end by year 9999. Change points start at `fromMonth: 1`, increase strictly
and fit the window. Amounts use canonical nonnegative int64 minor-unit strings
with `currency: "GBP"`. Zero capacity is confirmed evidence; an absent budget
returns 404 and is not treated as zero.

For example, a capacity of `"50000"` and two requests of `"30000"` per month
preserve both requests. Saved goal priority, then canonical goal UUID, determines
the `"30000"`/`"20000"` planned split and `"10000"` shortfall. All arithmetic is
exact. The final change-point amount continues within the assessed capacity
window. Requests outside that window remain explicitly unassessed.

At most fifty goal plans may be active. Archiving a goal frees its current slot
and preserves its history. Goal priority/status edits advance the budget revision
atomically. Existing legacy plans remain unverified and block activation; the
migrations invent no capacity, participants or history.

## Routes and authentication

Use the application's existing authenticated authorization header. Every read
and write rechecks the live session and relevant household/goal participation.
All responses use `Cache-Control: no-store`.

| Route under `/v1`                                          | Methods  | Response                                    |
| ---------------------------------------------------------- | -------- | ------------------------------------------- |
| `/households/:householdId/contribution-budget`             | GET, PUT | Current calculated budget view              |
| `/households/:householdId/contribution-budget/history`     | GET      | Bounded history page and current view       |
| `/households/:householdId/contribution-budget/export`      | GET      | Free JSON history export page               |
| `/households/:householdId/goals/:goalId/contribution-plan` | GET, PUT | Budget view with selected plan              |
| Goal plan `/history` and `/export`                         | GET      | Goal-specific history plus capacity changes |
| `/me/archive/contribution-budgets`                         | GET      | Captured frozen budget IDs                  |
| `/me/archive/contribution-budgets/:budgetId`               | GET      | Frozen calculated view                      |
| Archive budget `/history` and `/export`                    | GET      | Frozen history/export page                  |
| Archive budget `/goals/:goalId/contribution-plan`          | GET      | Frozen selected plan and budget view        |
| Archive goal plan `/history` and `/export`                 | GET      | Frozen goal history/export page             |

Archive routes are read-only. Leaving captures an immutable revision ceiling;
later co-owner changes are not visible through it. Actual deletion and signed
journal restore remove exclusive and unjustified later history while retaining
independently authorized shared/frozen evidence and its exact timestamps.

## Writes and replay

PUT requires a UUID `Idempotency-Key` and a quoted budget `If-Match`, such as
`"0"` for first capacity creation or `"3"` for budget revision three. A plan
body also requires `expectedGoalVersion` and `expectedPlanVersion`; zero plan
version means first creation. Its remaining fields are `firstContributionDate`
and `monthlyContributions`. Bodies reject unknown fields and cannot supply
participant lists, household IDs or calculated funding results.

Conflicting versions return 409 without partial writes. The same key, versions
and canonical body replay the exact encrypted original view after current
authority checks. Different details with that key return `IDEMPOTENCY_CONFLICT`.
Unchanged intentions and exact replay add no financial revision, audit or hint.
Archiving preserves replay of a completed request for authorized participants;
it still prevents new plan writes.
The fifty-plan bound returns safe `CONTRIBUTION_PLAN_LIMIT`; source database
details are never returned.

## Paging, exports and events

History, export and archive-list queries accept only an optional `cursor`.
Pages contain at most fifty entries. Pass their opaque `nextCursor` to the same
operation until null. Tokens authenticate actor, session, membership/grant epoch
or archive mode, budget, selected goal and operation. Active pages are current
authorized views, not a frozen snapshot across multiple requests. Ordinary view
GETs accept no query fields.

Exports are free, including after entitlement expiry or downgrade. They require
fresh MFA before and after reading; a proof that expires during a lock wait
cannot release the export. Export and history cursors cannot be interchanged.

Committed revisions emit only the existing empty PostgreSQL status hint. Reads,
rollbacks, unchanged writes and replay stay silent. Authenticated durable history
supports reconnect catch-up; hints contain no financial data or access grant.
There is no recurring database/API discovery polling. Client subscription
registration and reconciliation screens remain Task E.

The additive migrations preserve legacy financial rows. Recovery uses reviewed
forward fixes or the verified isolated restore procedure; never reset personal
storage or drop retained financial history. Local activation and deployment are
separate from repository delivery. Deployment remains prohibited until MVP and
the user's explicit approval.
