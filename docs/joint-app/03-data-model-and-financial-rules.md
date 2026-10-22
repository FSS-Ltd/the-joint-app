# The Joint App — Data Model and Financial Invariants

**Purpose:** Define storage and arithmetic that the API, ingestion jobs and AI must all obey.

**Companion documents:** [architecture](02-architecture-and-project-structure.md), [integrations](04-account-integrations.md), [projection algorithms](05-local-ai-and-projections.md).

## 1. Conventions

- IDs are server-generated UUIDs. Every tenant-owned record has `householdId`.
- Timestamps are UTC instants; financial dates are separate date-only fields with provider timezone/provenance. Calendar reports use the household timezone, initially Europe/London.
- Cash values are signed integer minor units in `BIGINT`, serialized as decimal strings. Never serialize a BigInt as a JSON number or calculate currency using JavaScript float arithmetic.
- Currency is ISO 4217 with an explicit exponent table. GBP uses two decimal places; do not assume every currency does.
- Quantities and unit prices use PostgreSQL `NUMERIC(28,12)` and a decimal library. Rates use decimal strings and a named convention.
- Round cash to its currency's minor unit only at specified settlement/reporting boundaries using half-up rounding; retain unrounded intermediate values. Source-reported values are retained unchanged.
- Account liabilities store positive outstanding debt in valuations. Canonical transaction credits/inflows are positive and debits/outflows are negative across providers; preserve each provider's original sign convention separately in source lineage.
- Version user-editable entities for optimistic concurrency. Keep provider data and user annotations separate.
- Do not store raw bank logins, card PAN/CVV, national-insurance numbers or children's identity documents.

## 2. Entity catalogue

| Entity              | Key fields and relationships                                                                | Important indexes/constraints                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| User                | Auth subject, status, locale, disabledAt                                                    | Unique auth subject                                                                                              |
| SessionRegistry     | User, provider session ID, revokedAt, lastSeenAt                                            | Unique session ID; user/revokedAt                                                                                |
| Household           | Name, baseCurrency, timezone, status                                                        | One active membership per user in MVP                                                                            |
| Membership          | Household, user, role, acceptedAt, status                                                   | Unique household/user; at most two active adults                                                                 |
| Invitation          | Household, email hash, token hash, expiry, consumedAt                                       | Unique token hash; no plaintext invite token                                                                     |
| ChildProfile        | Household, nickname, birthMonth/year optional, managedBy                                    | No authentication user foreign key                                                                               |
| Account             | Household, kind, currency, legalOwnerKind, child ID optional, liquidity, canonical identity | Unique household/id; no account-number exposure                                                                  |
| AccountOwner        | Account, member/user identity, optional shareBps, active/archive state                      | Shared ownership not inferred from connection owner; ownership supports owner-only archive access after exit     |
| AccountAuthority    | Account, adult user/member, basis OWNER or GUARDIAN_MANAGER, verification reference, status | Separate control authority from legal asset ownership; guardian authority does not make child assets adult-owned |
| AccountGrant        | Account, grantee member, NONE/TOTALS/TRANSACTIONS, version                                  | Unique account/member; household-matched FK                                                                      |
| Connection          | Household, consenting member, provider, environment, state, consent expiry                  | Household/provider/state                                                                                         |
| ConnectionSecret    | Connection, ciphertext, wrapped key, key version                                            | Worker-only access                                                                                               |
| ProviderAccountLink | Connection, external account ID, canonical account                                          | Unique connection/external ID                                                                                    |
| ProviderCapability  | Connection/account, supported features, observedAt                                          | Changes versioned                                                                                                |
| SyncCheckpoint      | Connection, stream, stable cursor, in-progress resume state                                 | Unique connection/stream; published cursor separate from working position                                        |
| SyncRun             | Connection, start checkpoint, state, coverage, revocation generation                        | Connection/state/start time; publish once                                                                        |
| SourceRecord        | Run, account, provider namespace/ID, hash, short-lived encrypted payload                    | Run/account/source identity; quarantined unknown fields                                                          |
| BalanceSnapshot     | Account, amount, value type, provider asOf, fetchedAt, completeness                         | Account/asOf descending                                                                                          |
| Transaction         | Account, source, source ID, bookedDate, signed minor units, currency, status                | Unique account/source namespace/source ID; account/bookedDate                                                    |
| TransactionRevision | Transaction, source hash, receivedAt, source fields                                         | Immutable source lineage                                                                                         |
| TransactionOverride | Transaction, author, category/merchant override, private note, version                      | Never overwritten by refresh; owner-controlled classifications, notes private to author by default               |
| TransactionSplit    | Transaction, category, signed minor units, transfer link optional                           | Splits sum exactly to parent                                                                                     |
| TransferLink        | Debit/credit transaction IDs, confidence, confirmedBy                                       | Each transaction at most one active link                                                                         |
| Category            | Household or template, parent, kind                                                         | Stable codes independent of display names                                                                        |
| CategorisationRule  | Member scope, account/category, priority, match fields                                      | Explicit priority; ownership applies                                                                             |
| Budget              | Household, month, currency, scope                                                           | Unique scope/month/category via BudgetLine                                                                       |
| BudgetLine          | Budget, category, limitMinor                                                                | Nonnegative limit                                                                                                |
| RecurringCandidate  | Visible account scope, merchant pattern, next date estimate                                 | Evidence transaction IDs retained                                                                                |
| Instrument          | ISIN/provider identifier, exchange, currency                                                | Symbol alone is not globally unique                                                                              |
| HoldingSnapshot     | Account, instrument, quantity, price/value, asOf                                            | Account/instrument/snapshot ID                                                                                   |
| InvestmentEvent     | Account, external ID, type, quantity, fees, cash impact                                     | Unique account/adapter namespace/external ID                                                                     |
| ManualValuation     | Account, amount, asOf, author, provenance                                                   | Account/asOf; value version                                                                                      |
| FxRate              | Base/quote, value, effective date, source                                                   | Unique base/quote/date/source                                                                                    |
| Goal                | Target, currency, target date, beneficiary, priority, status                                | Household/beneficiary/status                                                                                     |
| GoalAllocation      | Goal, funding account, allocated amount or percentage, valuation reference                  | Locked account row prevents over-allocation                                                                      |
| ContributionPlan    | Goal, amount, frequency, start/end, funding scope                                           | No executed transfer implied                                                                                     |
| Scenario            | Requester, authorised scope, input JSON, engine version                                     | Immutable run revision                                                                                           |
| ProjectionRun       | Scenario, dataset/grant versions, outputs, status                                           | Reproducible inputs and checksum                                                                                 |
| Device              | Household, paired member, public key, capabilities, revokedAt                               | Unique key ID; capabilities are supported functions, not source access                                           |
| DeviceAccountGrant  | Household, account, device, approving owner, maximum grant level, version, revokedAt        | Unique account/device/approver; tenant-matched foreign keys; distinct from partner grants                        |
| InsightJob          | Requester, device, evidence refs, versions, expiry, state                                   | Device/state/runAfter                                                                                            |
| InsightResult       | Job, validated answer, evidence refs, model/prompt version                                  | Immutable revision; permission checks on read                                                                    |
| BillingAccount      | Household, billing payer, provider IDs                                                      | Provider IDs unique, no client transfer                                                                          |
| Subscription        | Billing account, purchaser, source, provider ID, effective period, verified status          | Immutable household binding; unique provider/subscription ID                                                     |
| SubscriptionEvent   | Provider event ID, payload hash, receivedAt                                                 | Unique provider/event ID                                                                                         |
| FounderGrant        | Household, issuer, reason, capabilities, issuedAt, expiresAt                                | Expiry no more than 90 days; auditable renewal                                                                   |
| Entitlement         | Household, source, feature, active interval, cap, reason                                    | Derived view; founder grants auditable                                                                           |
| ImportBatch         | Account, file checksum, parser/mapping version, state                                       | Duplicate file detection within account                                                                          |
| ExportJob           | Requester, scope, expiring object key, status                                               | Recheck scope before download                                                                                    |
| AuditEvent          | Actor, action, resource IDs, correlation ID, timestamp                                      | Household/time; no financial payload                                                                             |
| Job / OutboxEvent   | Work, lease, idempotency, transaction references                                            | Unique type/idempotency key                                                                                      |

For child-owned accounts, control operations require a recorded authorised adult guardian/manager in AccountAuthority. LegalOwnerKind remains CHILD. Where another specification says source owner for grants, device consent or child-goal allocations, an independently authorised guardian manager may act for that child account; ordinary household membership or a viewing grant is insufficient. Child account funding must remain for the child beneficiary and respect access restrictions.

Entity names are the canonical domain language. Add indexes after observing the intended query plans, but the tenant and uniqueness constraints above are mandatory at creation.

## 3. Selected SQL blueprint

This is an illustrative core migration excerpt, not a claim that the entire schema has been generated. Phase 1 creates the full Prisma schema and corresponding checked SQL; later phases add their entities.

```sql
CREATE SCHEMA IF NOT EXISTS app;

CREATE TYPE app.account_kind AS ENUM
  ('CURRENT','SAVINGS','CREDIT_CARD','LOAN','MORTGAGE',
   'INVESTMENT','PENSION','PROPERTY','OTHER_ASSET','OTHER_LIABILITY');
CREATE TYPE app.grant_level AS ENUM ('NONE','TOTALS','TRANSACTIONS');

CREATE TABLE app.account (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES app.household(id),
  kind app.account_kind NOT NULL,
  label text NOT NULL,
  currency char(3) NOT NULL,
  legal_owner_kind text NOT NULL
    CHECK (legal_owner_kind IN ('ADULT','JOINT_ADULT','CHILD')),
  child_profile_id uuid,
  liquidity text NOT NULL
    CHECK (liquidity IN ('AVAILABLE','RESTRICTED','LOCKED')),
  version integer NOT NULL DEFAULT 1,
  archived_at timestamptz,
  UNIQUE (household_id, id),
  FOREIGN KEY (household_id, child_profile_id)
    REFERENCES app.child_profile(household_id, id),
  CHECK ((legal_owner_kind = 'CHILD') = (child_profile_id IS NOT NULL))
);

CREATE TABLE app.account_grant (
  household_id uuid NOT NULL,
  account_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  level app.grant_level NOT NULL,
  version integer NOT NULL DEFAULT 1,
  PRIMARY KEY (account_id, membership_id),
  FOREIGN KEY (household_id, account_id)
    REFERENCES app.account(household_id, id),
  FOREIGN KEY (household_id, membership_id)
    REFERENCES app.membership(household_id, id)
);

CREATE TABLE app.transaction (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL,
  account_id uuid NOT NULL,
  source_namespace text NOT NULL,
  source_id text NOT NULL,
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  booked_date date,
  status text NOT NULL
    CHECK (status IN ('PENDING','BOOKED','REVERSED','SUPERSEDED')),
  provider_revision text,
  source_hash text NOT NULL,
  received_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1,
  UNIQUE (account_id, source_namespace, source_id),
  FOREIGN KEY (household_id, account_id)
    REFERENCES app.account(household_id, id),
  CHECK (status <> 'BOOKED' OR booked_date IS NOT NULL)
);
CREATE INDEX transaction_report_idx
  ON app.transaction(household_id, account_id, booked_date DESC)
  WHERE status = 'BOOKED';
```

Create referenced tables before this excerpt. Every relation joining tenant data uses tenant-matched foreign keys where possible; application validation is not the only safeguard.

A totals-only role must not be permitted to select raw transaction rows. At runtime, scoped repositories and RLS restrict record visibility. RLS policies and views require their own migration and negative tests, not a generic “authenticated user” policy.

## 4. Account identity and duplicate connections

Provider links are not accounts. A couple may consent separately to the same joint bank account; the canonical Account must remain singular. Use provider-supplied stable account identity when available, otherwise propose a user-confirmed match using masked descriptors. Never silently merge on bank name and four trailing digits alone.

Keep separate Connection records so either adult can revoke their own consent. Do not copy credentials across owners. The adapter chooses an authorised healthy source link for refresh; reporting counts the canonical Account once.

When migrating a manual account to live sync, link rather than duplicate it. Existing manual rows in overlapping dates go into reconciliation review; preserve source provenance and user notes.

## 5. Financial invariants

### Net worth

Adult household net worth equals the value of permitted adult-owned assets minus the outstanding balance of permitted adult liabilities. Count a canonical account once. Investment account total includes its cash and holdings; never add the provider total and all holdings again. Property value and mortgage debt are separate.

Show these distinct figures:

1. Adult net worth.
2. Liquid adult assets.
3. Child-owned assets, separately.
4. Optional combined family assets/net worth, with ownership labels.

A totals-only grant can enter the appropriate net-worth total. If not every account is visible, call it “visible net worth”. Missing prices/FX or incomplete snapshots result in an incomplete total with excluded amounts disclosed, not zero-valued holdings.

A provider-reported portfolio total takes precedence when its scope is known and current. A holdings-derived total is a separately labelled alternative only when holdings, cash and FX are complete. Mixing stale rows into an apparently fresh total is prohibited.

### Spending and transfers

A posted purchase is spending. A movement between the household's own accounts is a transfer. Saving and investment contributions are transfers between asset accounts; they are not new income or household consumption. Selling an investment is not salary. A gift to a child-owned account is an adult cash outflow and child contribution, labelled separately from consumption.

Credit-card purchases count as spending on the purchase posting date. Paying that card from a tracked current account is a transfer and debt settlement, not a second purchase. If the card's purchases are missing, label the card payment as a debt-payment cash outflow and disclose incomplete spending coverage; do not invent categories.

Mortgage/loan payments have cash-flow impact. If principal and interest are known, principal reduces debt and interest/fees are expenses. When the split is unknown, preserve a debt-service category and mark consumption totals as incomplete instead of guessing.

Income less spending is not identical to change in bank balances, savings contributions or net-worth growth. Show separate named measures and reconcile the bridge.

### Refunds and reversals

Link refunds to original transactions when possible, but report cash effects in the actual booked month. Keep negative category spending where refunds exceed that month's purchases. Do not rewrite old statements invisibly. Distinguish a cancelled pending authorisation, a superseded erroneous source revision, and a later booked reversal. A settled January purchase reversed in February retains the January purchase and a February offset. Only cancellation/correction removes the invalid event from the active dataset; preserve its lineage and mark historical reports revised. Do not set a settled original to REVERSED merely to erase its earlier booked-month effect.

### Pending activity

Pending rows appear in a preview only. On settlement, link/supersede the pending record rather than counting both. Amount, date and merchant may change. Use provider identifiers first, cautious matching second, and manual review when ambiguous.

### Investment performance

Holdings value is not investment performance. A £1,000 deposit that raises a portfolio from £5,000 to £6,000 is not a 20% return. Initial MVP shows value, contributions, withdrawals and provider-reported gain where trustworthy. A computed money-weighted/time-weighted return is deferred until complete cash-flow and corporate-action history is available and tested.

### Multi-currency

Store original units. For reporting, persist the FX source, rate and effective date; historical rows use historical rates, not today's rate. A connected provider may give portfolio base-currency totals but not complete currency ledgers. Surface that capability limit.

GBP-only accounts can launch without an external FX provider. Mixed-currency accounts require an approved rate source or explicitly entered valuations and cannot silently be treated as GBP. No unknown-rate assets enter a complete consolidated total.

## 6. Goals are allocations, not additional assets

A virtual £2,000 holiday goal backed by £2,000 in savings does not add £2,000 to net worth. An account may fund several goals only if their allocations do not exceed its permitted available value. Lock the existing Account row, then sum and commit active allocations in the same transaction to prevent concurrent over-allocation.

A valuation fall may make previously valid allocations underfunded. Preserve target intentions, mark shortfall and ask the user to rebalance; do not silently invent available money.

Future monthly contributions are plans, not observed transactions. A £250 planned contribution must not become an actual savings event until a matching imported/manual record exists. Several goals share a finite monthly contribution budget; require explicit priority or proportions.

## 7. Categorisation and recurring-cost rules

Use this precedence: an explicit owner override, then the highest-priority enabled owner rule, then a mapped provider category with provenance, otherwise Uncategorized. A refresh cannot overwrite the override. Rule creation/execution requires categorisation.automation; reading/deleting an existing rule does not.

Implement a pure recurring-cost detector over authorised booked expenses. Group by canonical account, currency and normalised merchant; require at least three occurrences in 180 days. Flag weekly candidates when the median gap is 6–8 days and monthly candidates at 25–35 days. Report variable amounts rather than discarding the pattern; use median observed amount as a labelled estimate. Manual confirmation is required before treating a candidate as a committed bill. Do not infer that a recurring merchant is a subscription or unused. Annual bills are manual initially because 180 days cannot establish annual recurrence.

Recompute candidates after relevant source/classification changes. Combine overlapping proposed reductions without adding the same saving twice. Tests cover a genuine monthly charge, an irregular cafe pattern, a variable monthly bill, a refund and an excluded transfer. Candidate confidence is a heuristic label, not a probability.

## 8. Data freshness and provenance

Every report carries: calculation time, source as-of dates, last successful sync, dataset version, account scope, completeness and excluded reasons. Suggested stale thresholds are product defaults: bank feed older than 48 hours, brokerage snapshot older than 48 hours and manual balance older than 30 days. A provider holiday/outage does not automatically imply a wrong figure; freshness is descriptive.

Store raw provider payloads encrypted only for the short troubleshooting window in the security document. Normalised rows, source hashes and revisions provide durable lineage without indefinite raw retention.

## 9. Golden fixtures and mandatory assertions

| Fixture                                                                | Expected assertion                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| £500 current→savings transfer, both sides imported                     | £0 consumption; aggregate adult net worth unchanged                             |
| £120 card purchase then £120 card payment                              | £120 spending, not £240                                                         |
| £5,000 portfolio + £1,000 contribution, no market move                 | £6,000 value; £0 investment gain                                                |
| £10,000 broker total with £2,000 cash and £8,000 holdings              | £10,000 counted once                                                            |
| £3,000 child-owned ISA and £7,000 adult savings                        | Adult assets £7,000; child assets £3,000                                        |
| £500 savings, two allocations of £300 in concurrent requests           | At most one succeeds; other gets ALLOCATION_EXCEEDS_AVAILABLE                   |
| Two valid £4.50 cafe transactions on same day                          | Both survive; amount/date/merchant hash is not unique identity                  |
| Import exact same source file twice                                    | Second import is idempotent, not duplicate spending                             |
| Pending £40 becomes booked £42                                         | Booked spend £42, pending record superseded                                     |
| January £50 purchase refunded/reversed by a booked February £50 credit | January spending £50; February category offset −£50; original history preserved |
| Household B requests account A by known UUID                           | No existence/detail leak; no rows returned                                      |
| TOTALS user requests merchants or category aggregates                  | Denied or omitted; no detailed inference                                        |
| £1,000 start, £250 monthly, £4,000 target, 0%                          | 12 end-of-month contributions                                                   |
| Goal target achieved at start                                          | Month 0, no fabricated future contribution                                      |
| Missing GBP conversion for USD-only asset                              | Incomplete aggregate; no 1:1 currency assumption                                |

## 10. Migrations and retention ownership

Prisma migrations own application schema changes. Use a single migration history; do not run parallel Supabase and Prisma migration streams against the same app tables. Infrastructure/auth configuration may be managed separately and documented.

Expand/contract migrations preserve rollback compatibility. Backfill in bounded jobs. A destructive migration requires a backup and restore evidence. No deletion task is complete until affected source objects, device jobs, exports, generated insights and caches follow the documented retention lifecycle.
