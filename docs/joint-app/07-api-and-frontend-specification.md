# The Joint App — API and Frontend Specification

**Status:** Canonical proposed application contracts. Provider APIs are separate and described in [04](04-account-integrations.md).

**Base:** `/v1`. In the tables below, **H** means `/v1/households/{householdId}`.

## 1. Contract rules

The Nest API is the single financial authority for web, native mobile and jobs. OpenAPI documents public contracts; generate a typed client from the same Zod-backed DTO definitions used for validation. Do not maintain three competing client shapes.

IDs in actual API requests are UUIDs. Money is `{amountMinor: string, currency: string}`; decimal strings must match a bounded integer grammar. Dates are ISO date-only strings; instants include UTC offsets. Responses distinguish absent, unknown and zero. Unknown fields, invalid enum values and unsupported currencies return validation errors.

All household requests resolve current membership independently of the path. Account IDs are constrained by current grants. Child-account control actions additionally require recorded AccountAuthority as specified in 03; a guardian manager never becomes the legal asset owner merely by using the app. A hidden/cross-tenant object returns `404 NOT_FOUND` without revealing existence. `403` is for a known permitted resource whose operation requires an additional capability, not evidence that another user's private account exists.

Use cursor pagination with default 50 and maximum 200 rows. Cursors are signed, scoped to the actor/filter/sort and opaque. Stable sorting uses booked date then ID. Date filters use inclusive from/exclusive to boundaries.

Use `Idempotency-Key` on creation, imports, refresh and billing actions. Scope to actor, route and payload hash; repeated payload replays its result, changed payload gets 409. Retain request keys at least 24 hours; durable source uniqueness remains independent. Editing uses `If-Match`/version; stale edits get `409 VERSION_CONFLICT`.

## 2. Shared types and service interfaces

```ts
type Money = { amountMinor: string; currency: string };
type GrantLevel = "NONE" | "TOTALS" | "TRANSACTIONS";
type Capability =
  | "finance.manual"
  | "projections.basic"
  | "connections.bank"
  | "connections.broker"
  | "projections.advanced"
  | "categorisation.automation"
  | "insights.local";

interface AuthContext {
  userId: string;
  membershipId: string;
  householdId: string;
  sessionId: string;
  grantVersion: number;
  requestId: string;
}
interface Freshness {
  calculatedAt: string;
  datasetVersion: number;
  sourceAsOf: string | null;
  completeForScope: boolean;
  warnings: { code: string; message: string }[];
}
interface EntitlementsDto {
  plan: "FREE" | "PLUS";
  version: number;
  capabilities: Capability[];
  caps: {
    bankAuthorisations: number;
    brokerConnections: number;
    companionDevices: number;
  };
  effectiveUntil: string | null;
}
```

`AuthContext` is created by trusted server guards, never deserialized from a client. Domain services accept it explicitly. Background jobs use a distinct `JobContext` resolved from a persisted authorised job and connection consent.

Key interfaces:

- `AccountAccessService.require(ctx, accountIds, level): Promise<AuthorizedAccountScope>`.
- `EntitlementService.require(ctx, capability): Promise<void>`.
- `Database.withScope(ctx, callback): Promise<T>`; applies RLS context transaction-locally.
- `ProjectionService.run(ctx, input): Promise<ProjectionRunDto>`.
- `InsightService.enqueue(ctx, request): Promise<InsightJobDto>`.
- `ConnectionService.start(ctx, request): Promise<ConsentStartDto>`.

A device and a provider webhook do not get a user's AuthContext by supplying their UUID. They have separate authentication and limited operation scopes.

## 3. Endpoint catalogue

### Identity, households and accounts

| Method and route                                       | Purpose                                            | Permission                                                     |
| ------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------- |
| GET `/v1/me`                                           | Current identity, memberships and session state    | Authenticated                                                  |
| POST `/v1/households`                                  | Create the first household                         | Authenticated, no active household                             |
| POST H`/invitations`                                   | Invite the second adult                            | Household admin, capacity checked                              |
| POST `/v1/invitations/accept`                          | Consume token and bind verified invited identity   | Authenticated matching email                                   |
| DELETE H`/memberships/me`                              | Leave safely; no partner approval needed           | Current member                                                 |
| GET `/v1/me/archive/accounts`                          | List own retained records after exit               | Authenticated recorded owner, separate archive policy          |
| GET `/v1/me/archive/accounts/{accountId}/transactions` | Read own archived records                          | Recorded owner only, no inherited partner grants               |
| POST `/v1/me/archive/exports`                          | Export own archive                                 | Recorded owner and recent reauthentication                     |
| GET `/v1/me/archive/exports/{id}/download`             | Stream owner archive after a fresh ownership check | Recorded owner only; same download policy as household exports |
| GET/POST H`/accounts`                                  | Visible accounts / create own manual account       | Current member                                                 |
| PATCH H`/accounts/{id}`                                | Edit own manual metadata                           | Owner and expected version                                     |
| PUT H`/accounts/{id}/grants/{memberId}`                | Set visibility                                     | Account owner; MFA for widening                                |
| POST H`/accounts/{id}/valuations`                      | Add a dated manual value                           | Owner, not editing provider original                           |
| GET/POST H`/children`                                  | View/create permitted beneficiary records          | Authorised adult                                               |
| GET H`/wealth`                                         | Permission-scoped valuation breakdown              | Current member                                                 |

Separate account ownership, sharing and beneficiary updates. Changing a label cannot change ownership or move an account to another household.

### Connections and imports

| Method and route                          | Purpose                                                       |
| ----------------------------------------- | ------------------------------------------------------------- |
| POST H`/connections/start`                | Begin approved bank consent; owner-bound state                |
| GET `/v1/connections/callback/{provider}` | Validate bound browser return and provider status             |
| POST H`/connections/trading212`           | Approval-gated, write-only key/secret submission              |
| GET H`/connections`                       | Owner-visible connection status and safe capabilities         |
| POST H`/connections/{id}/sync`            | Enqueue refresh, coalesce duplicates                          |
| POST H`/connections/{id}/reauthorize`     | Renew existing owner's consent                                |
| DELETE H`/connections/{id}`               | Immediately stop local access and arrange upstream revocation |
| POST H`/imports/preview`                  | Upload/mapping validation and duplicate review                |
| POST H`/imports/{id}/commit`              | Commit reviewed rows idempotently                             |
| DELETE H`/imports/{id}`                   | Roll back eligible import rows with lineage checks            |

Never return stored provider credentials. A callback's `success=true` does not constitute provider verification. An allowed return URI is selected by the server, not accepted as an arbitrary URL parameter.

### Spending, budgets and goals

| Method and route                           | Result                                                       |
| ------------------------------------------ | ------------------------------------------------------------ |
| GET H`/transactions`                       | Paginated authorised detail                                  |
| PATCH H`/transactions/{id}/annotation`     | Category/notes override with version                         |
| PUT H`/transactions/{id}/splits`           | Validated splits summing to parent amount                    |
| POST H`/transfers/confirm`                 | Confirm a proposed owned-account transfer                    |
| GET H`/reports/spending`                   | Complete-period category totals and coverage                 |
| GET H`/recurring-costs`                    | Permission-scoped observed candidates; confirmation required |
| GET/POST H`/categorisation-rules`          | Read rules / create with automation entitlement              |
| PATCH/DELETE H`/categorisation-rules/{id}` | Owner rule edit with entitlement / free deletion             |
| GET/PUT H`/budgets/{month}`                | Category limits and actual spending                          |
| GET/POST H`/goals`                         | List/create goals                                            |
| GET/PATCH H`/goals/{goalId}`               | Read/edit target and ownership-safe details                  |
| PUT H`/goals/{goalId}/allocations`         | Atomically validate funding allocations                      |
| PUT H`/goals/{goalId}/contribution-plan`   | Store planned contributions                                  |
| POST H`/projections/basic`                 | Free zero-growth fixed-contribution estimate                 |
| POST H`/scenarios`                         | Save advanced what-if input; Plus                            |
| POST H`/projections`                       | Run advanced scenario by scenario ID; Plus                   |
| GET H`/projections/{projectionId}`         | Read existing result with current grants                     |

Basic projections are not silently placed behind the advanced-scenario paywall. Advanced jobs recheck entitlements on execution. Previously saved results remain readable on downgrade unless source grants were revoked.

### Local AI, billing and privacy

| Method and route                          | Purpose                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| GET/POST H`/devices`                      | List/start pairing                                                           |
| POST H`/devices/{deviceId}/approve`       | Confirm device and fingerprint                                               |
| PUT H`/devices/{deviceId}/account-grants` | Owner approves permitted data for the named device                           |
| DELETE H`/devices/{deviceId}`             | Revoke device and leases                                                     |
| GET/POST H`/insights/jobs`                | List/enqueue authorised requests                                             |
| GET/DELETE H`/insights/jobs/{jobId}`      | Read state/result or cancel                                                  |
| GET H`/entitlements`                      | Current server-authoritative capabilities                                    |
| GET H`/billing/status`                    | Safe source, effective end date and management options                       |
| POST H`/billing/checkout`                 | Server creates web checkout for authenticated payer                          |
| POST H`/billing/portal`                   | Server creates permitted web management session                              |
| POST H`/exports`                          | Enqueue permission-scoped export                                             |
| GET H`/exports/{id}`                      | Recheck scope; expose an expiring authenticated app download route           |
| GET H`/exports/{id}/download`             | Recheck current grants on every new download and stream private object bytes |
| POST `/v1/privacy/deletion-requests`      | Initiate verified account deletion                                           |
| GET `/v1/privacy/deletion-requests/{id}`  | Requester's deletion status                                                  |

Public webhooks are `POST /v1/webhooks/billing/{provider}` and `POST /v1/webhooks/accounts/{provider}`. Verify each provider's documented authentication/signature scheme against the original bytes, deduplicate and enqueue. No user cookies are used to authenticate webhooks.

Companion routes: `POST /v1/companion/pairing/complete`, `/session`, `/jobs/claim`, and job-specific `/jobs/{jobId}/evidence`, `/permit`, `/renew`, `/complete`. Add `POST /v1/companion/session/challenge` for a short-lived nonce before device proof. The evidence endpoint is GET; mutation endpoints are POST. Device proof, nonce/expiry, job binding and current permissions are mandatory. Device access cannot call the ordinary household data API.

## 4. Example request and response

Basic estimate request:

```json
{
  "goalId": "0db542d5-7dce-4d15-9503-5e02e5caebd9",
  "openingBalance": { "amountMinor": "100000", "currency": "GBP" },
  "target": { "amountMinor": "400000", "currency": "GBP" },
  "monthlyContribution": { "amountMinor": "25000", "currency": "GBP" },
  "firstContributionDate": "2026-11-30",
  "contributionTiming": "month_end"
}
```

The server verifies authorised goal/funding records. Explicitly entered numbers are labelled hypothetical and cannot overwrite recorded balances. A recorded-balance mode derives them server-side.

```json
{
  "id": "f8b5ea92-746d-44c1-88a8-6508076250d3",
  "status": "reachable",
  "paymentsRequired": 12,
  "projectedDate": "2027-10-31",
  "engineVersion": "1.0.0",
  "rounding": "HALF_UP",
  "assumptions": { "growthAnnual": "0", "feesAnnual": "0" },
  "freshness": {
    "calculatedAt": "2026-10-22T12:00:00Z",
    "datasetVersion": 17,
    "sourceAsOf": "2026-10-22T08:00:00Z",
    "completeForScope": true,
    "warnings": []
  }
}
```

`ProjectionRunDto` uses mode `BASIC` or `ADVANCED`, nullable scenarioId, and the lowercase status enum defined in 05. `EntitlementsDto` is the public response; the internal `HouseholdEntitlements` reducer output is mapped to it explicitly.

An actual ProjectionRunDto also includes its immutable input hash, scope, monthly series and contribution/fee/growth breakdown described in the projection spec.

Errors use problem-style JSON:

```json
{
  "type": "https://joint.invalid/problems/entitlement-required",
  "title": "This action needs Household Plus",
  "status": 403,
  "code": "ENTITLEMENT_REQUIRED",
  "capability": "projections.advanced",
  "requestId": "request_example"
}
```

`joint.invalid` is an example URI, not a registered production domain. Choose the actual domain during implementation.

| Status    | Codes/examples                                                           | Client behaviour                              |
| --------- | ------------------------------------------------------------------------ | --------------------------------------------- |
| 400 / 422 | VALIDATION_FAILED, UNSUPPORTED_CURRENCY                                  | Keep input; identify fields                   |
| 401       | SESSION_EXPIRED, REAUTH_REQUIRED                                         | Reauthenticate without losing safe form state |
| 403       | ENTITLEMENT_REQUIRED, CAPABILITY_UNAVAILABLE                             | Explain eligibility or upgrade                |
| 404       | NOT_FOUND                                                                | No private-resource existence disclosure      |
| 409       | VERSION_CONFLICT, CONNECTION_LIMIT_REACHED, ALLOCATION_EXCEEDS_AVAILABLE | Refresh/review rather than overwrite          |
| 429       | RATE_LIMITED                                                             | Respect Retry-After; do not multiply requests |
| 503       | PROVIDER_UNAVAILABLE, AI_DEVICE_OFFLINE                                  | Preserve known values and truthful status     |

An unavailable model normally yields an asynchronous queued state, not an error that breaks the dashboard. Numeric projection outcomes such as `beyond_horizon` are business results, not HTTP 500.

## 5. Web routes and screens

| Route                      | Main content                                            |
| -------------------------- | ------------------------------------------------------- |
| `/dashboard`               | Visible cash, spending, goals and sync issues           |
| `/activity`                | Search/filter, categories, splits and review            |
| `/budgets`                 | Monthly plan and actuals                                |
| `/accounts`                | Account cards, connection status, manual/import actions |
| `/accounts/[id]`           | Authorised account detail and grant settings            |
| `/wealth`                  | Assets, liabilities, histories and completeness         |
| `/goals` and `/goals/[id]` | Targets, allocations and basic estimate                 |
| `/scenarios`               | Advanced assumptions and comparisons                    |
| `/children`                | Separate beneficiary assets and goals                   |
| `/insights`                | Deterministic cards, AI status and evidence             |
| `/review`                  | Monthly household review                                |
| `/settings/sharing`        | Invitations, grants and safe exit                       |
| `/settings/devices`        | Pair/revoke companion                                   |
| `/settings/billing`        | Plan, source and restore/manage options                 |
| `/settings/privacy`        | Export, disconnect, delete and data explanations        |

Use bottom navigation on narrow screens: Home, Activity, Goals, Wealth, More. Native screens can reorganise gestures and navigation while preserving domain actions. Do not ship the PWA inside a WebView as the entire native app.

## 6. Frontend implementation details

Use TanStack Query for server state with keys including user, household, resource filters and grant epoch. Use React Hook Form plus Zod for forms. Keep filters in URL search parameters where safe; never place credentials, raw account numbers or free-text AI questions in URLs.

Use a tiny client store only for ephemeral UI state. Permission and entitlement decisions always come from the server. On logout, household exit or grant invalidation, remove affected query caches and navigation history where possible.

Render money using explicit currency and locale, not concatenated symbols. For negative values expose signs to screen readers. Charts include text totals and accessible data tables. Category corrections provide undo. Budget forms support keyboard use, visible errors and clear loading states.

Financial pages are dynamic and return `Cache-Control: private, no-store`. The PWA service worker caches only static assets and a non-sensitive offline shell. No banking response enters shared CDN caches. MVP makes no offline finance-editing promise; queued financial writes create difficult reconciliation and privacy issues and are deferred.

CSV UX: choose account, upload up to 10 MB/50,000 rows, map date/amount/currency, choose date convention explicitly, preview validation/overlap, then commit. Ambiguous UK/US dates require a choice. Escape spreadsheet formula-like cells in exports. Large data jobs report progress without freezing the browser.

## 7. Native-specific requirements

Use verified Universal Links/App Links for auth and provider returns with explicit allowlists and one-use state. SecureStore holds refresh/device credentials, not the whole ledger. Biometric unlock is a local convenience, not a substitute for server session validation or MFA.

Blur sensitive views when backgrounded; default push text to “Your account update is ready”. Do not include amounts, account labels or child data in push payloads. Show last-sync time and internet/provider/device state distinctly.

Test on physical iPhone and Android devices, including bank-app redirects, cancellation, MFA, interrupted linking, subscription restore and background/foreground. Simulator success alone is insufficient for the public gate.

## Implemented Task 3C.2 — shared goal metadata

Shared adult goal details are independent of funding permissions. A goal snapshots the active adult memberships present at creation; a later invitation does not expose an existing goal. This step offers no participant widening, child profile, allocation, contribution-plan or projection writer. Original unclassified goal rows receive no fabricated participants.

| Route                                      | Behavior                                                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `POST H/goals`                             | Create ACTIVE adult GBP metadata with `Idempotency-Key`. Identical retries resolve the same permitted goal; changed input returns 409. |
| `PUT H/goals/{goalId}`                     | Edit exact metadata or archive using positive quoted `If-Match`; stale versions and archived edits return 409.                         |
| `GET H/goals`                              | Fifty permitted goals per page.                                                                                                        |
| `GET H/goals/{goalId}`                     | Latest metadata and up to fifty immutable history entries.                                                                             |
| `GET H/goals/{goalId}/export`              | Free JSON attachment of the same authorized page; fresh MFA required.                                                                  |
| `GET /v1/me/archive/goals`                 | List goals in which this adult participated before leaving.                                                                            |
| `GET /v1/me/archive/goals/{goalId}`        | Metadata/history frozen at this adult's exit version.                                                                                  |
| `GET /v1/me/archive/goals/{goalId}/export` | Free frozen-history JSON attachment; fresh MFA required.                                                                               |

Metadata is exactly `name`, `status`, `beneficiary: ADULT`, `priority` (1–1000), nonnegative GBP `target`, and nullable canonical `targetDate`. IDs, household and version come from the server. No account IDs, source values, private notes or funded totals appear. Archive is read-only and retains previous revisions. Existing funding claims prevent this metadata-only archive operation until the later funding lifecycle is implemented.

List/detail/export accept only an optional `cursor`; use returned `nextCursor` until null. Cursors are encrypted and bound to actor, session, active membership/grant scope, goal and operation. Every page revalidates live authority. Active exports are successive current-authorized pages, not a claim of a database-wide point-in-time snapshot. Goal metadata JSON does not alter account-selected CSV exports or create retained export objects/tokens. No subscription gate applies.

Leaving freezes participation through the common membership transition, including privacy restore replay. Subsequent remaining-member edits cannot appear in the departing adult's archive. Deletion removes that adult's participant links and exclusively retained goals/history. Other participants retain only justified records: when every survivor is frozen, later revisions are removed and the goal head is restored to the exact surviving immutable revision, preserving its original timestamp. Independently shared live records remain available. No cross-household copy or new-partner inheritance is created. These backend interfaces have no goal UI yet; all execution remains local.
