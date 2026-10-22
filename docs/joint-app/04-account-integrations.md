# 04 — Account integrations

**The Joint App · Technical decision and implementation specification · Checked 22 October 2026, Europe/London**

**Status:** researched design; no production provider approval, bank connection or Trading 212 account has been tested for this project. **Fact** means supported by the linked primary source; **Decision** is the proposed implementation; **Unknown / gate** requires evidence before activation.

## 1. Delivery boundary and decisions

**Decision:** deliver read-only account aggregation through one UK Open Banking provider plus a separate Trading 212 adapter. Next.js supplies the PWA; a NestJS modular monolith and worker own integration logic. Supabase Postgres and Auth use London `eu-west-2`; private financial tables are in an unexposed application schema, accessed through NestJS with a least-privilege database role. PostgreSQL jobs avoid an initial Redis dependency. London web/API and worker hosts use separate IAM instance profiles; only the worker profile can decrypt the provider-secret KMS key. See 02 for the two-host boundary and 09 for the combined compute allowance.

The app never collects bank passwords, scrapes financial websites, initiates payments, places orders or changes portfolios. “Connect directly” means a supported, consented feed from the institution, using an authorised intermediary where required. Building separate bank APIs and acquiring the associated production permissions is outside the founder MVP.

**Decision:** evaluate TrueLayer Data v3 first, with Plaid Transactions as the commercial alternative. Evaluate Enable Banking only after confirming the actual UK institution and regulatory route. Implement one approved bank adapter initially. The procurement result can change this order without changing the application model.

### Blocking evidence register

| Gate                        | Evidence required                                                                                                                                                                          | Result if unresolved                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| B1 — bank production access | Written acceptance of the intended personal/household use; production credentials; the founder’s precise bank, account product and needed data supported                                   | Mock/import milestone only                                                                   |
| B2 — bank regulatory role   | Provider-approved description of who supplies AIS, contracts with the user, captures consent and, where applicable, registers the app as an agent; documented assessment of the app’s role | No live household/public service                                                             |
| B3 — sustainable pricing    | Quote covering setup, minimums, connection/account billing, refreshes, enrichment, reconnects, support, VAT and exit terms                                                                 | Do not promise an affordable paid plan                                                       |
| T1 — Trading 212 permission | Written approval covering the custom interface, intended other users, read-only account aggregation, partner display, hosting and eventual commercial use                                  | Hold Trading 212-specific implementation/use for this app; generic mock/CSV work can proceed |
| T2 — Trading 212 account    | An owned, supported live account and suitably scoped key; reconciliation against the provider UI/statement                                                                                 | Broker integration remains unverified                                                        |

**Fact:** the FCA distinguishes an agent acting for an AIS principal from a technical service provider that does not itself supply account information to the consumer. A household dashboard cannot simply declare itself a TSP because it uses an aggregator. An agent route also requires the appropriate principal relationship and registration. **Unknown / gate:** the correct arrangement for this product, including its initial couple-only deployment, must be established; neither personal use nor a provider’s licence automatically establishes an exemption. [1](https://www.fca.org.uk/firms/agency-models-under-psd2) [2](https://handbook.fca.org.uk/handbook/perg15)

## 2. Bank provider comparison

| Provider           | Verified technical route                                                                                                                        | Sandbox versus live                                                                                                                           | Commercial and regulatory gate                                                                                                                                              | Recommendation                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **TrueLayer**      | Data v3 is the recommended new integration and currently UK-only; hosted consent flow, connection IDs and accounts/balances/transactions access | Use sandbox for protocol tests. Production access and exact institution capabilities require approval and verification                        | Obtain household budgeting acceptance, regulatory arrangement, recurring access/renewal terms and quote. Hosted consent does not settle the app’s whole regulatory position | First procurement candidate; choose only after B1–B3                |
| **Plaid**          | UK Transactions product; Link/OAuth and cursor-based transaction updates                                                                        | Sandbox is simulated. UK/EU customers, or apps serving UK/EU users, are offered **Custom plans**. The advertised free Trial is US/Canada-only | Separate European production compliance process; quote/minimums and agent eligibility remain unknown                                                                        | Strong alternative if commercially viable; no assumed free UK pilot |
| **Enable Banking** | Official API exposes accounts, balances and transactions; documented restricted production mode for linked own accounts                         | Restricted own-account evaluation/non-commercial use is documented; public production requires agreement/KYB                                  | Exact UK retail-bank coverage, applicable UK permissions and permission for a two-person dashboard remain unverified. A country selector is insufficient evidence           | Conditional research candidate, not a promised UK feed              |

Sources: TrueLayer [3](https://docs.truelayer.com/docs/enable-your-users-to-connect-their-bank-account), [4](https://docs.truelayer.com/docs/data-api-basics); Plaid [5](https://plaid.com/docs/account/billing/), [6](https://plaid.com/docs/launch-checklist/), [7](https://plaid.com/docs/financial-insights/); Enable Banking [8](https://enablebanking.com/docs/api/linked-accounts/), [9](https://enablebanking.com/docs/faq/), [10](https://enablebanking.com/open-banking-apis/).

**Unknown / gate:** no exact cost is established for any candidate. Obtain a costed two-adult household example and scenarios at 100, 1,000 and 10,000 paying households. A £5.99/month or £59.99/year household price cannot be validated against unknown account-data minimums.

Provider selection must record `institution + country + retail product + account type + consented scopes + history depth + pending support + refresh budget + renewal flow`. Verify the founder’s real account after approval; national “bank coverage” does not guarantee a savings product, credit card, joint account or child account.

## 3. Trading 212: supported surface and hard boundaries

**Fact:** the current Public API is beta, with demo and live environments, and supports **Invest and Stocks ISA**. It does not establish support for CFD, Cash ISA, pension or child accounts. Requests use HTTP Basic authentication from an API key and secret. Account/position/result values are described as primary-account-currency values; full multi-currency wallet support is unavailable. Historical lists use `nextPagePath`, default page size 20 and maximum 50; rate limits apply per account. [11](https://docs.trading212.com/api)

**Fact:** users can select read-only permissions and restrict keys to trusted IPs. The help centre explicitly does not claim official partnerships with third-party apps. [12](https://helpcentre.trading212.com/hc/en-us/articles/14584770928157-Trading-212-API-key)

**Fact — contractual blocker:** API Terms 4.2(a) restrict commercial services; 4.2(i) restrict repackaging/resale. Clauses 6.2–6.3 limit personal/testing use and require prior written consent **before developing** applications intended for other end-users. Clause 6.7 also requires prior written consent for custom interfaces. Clause 7.1 excludes a real-time market-data promise and restricts third-party redistribution/display absent agreement. **Decision:** T1 gates this app’s provider-specific implementation and custom live interface, including founder use; approval must cover the shared/commercial scope. Partner consent does not replace provider permission. [13](https://www.trading212.com/legal-documentation/API-Terms_EN.pdf)

### Approved adapter allowlist

Base URLs: `https://demo.trading212.com/api/v0` and `https://live.trading212.com/api/v0`. Store the environment explicitly; never silently switch one to the other.

| GET path relative to base      | Needed permission      | Published rate ceiling |
| ------------------------------ | ---------------------- | ---------------------- |
| `/equity/account/summary`      | `account`              | 1 / 5 seconds          |
| `/equity/positions`            | `portfolio`            | 1 / second             |
| `/equity/history/orders`       | `history:orders`       | 20 / minute            |
| `/equity/history/dividends`    | `history:dividends`    | 20 / minute            |
| `/equity/history/transactions` | `history:transactions` | 20 / minute            |

**Fact:** history schemas include cash fees/interest/transfers, fill-level wallet impact and taxes/fees, and corporate-action fill types such as splits and spin-offs. These fields do not prove complete statement or tax coverage. [14](https://docs.trading212.com/_bundle/api.json?download=)

**Decision:** confirm the permission names in the live key UI, selecting only the required read permissions. Disable all execution and pie-writing permissions. No order placement/cancellation, pie mutation or generic provider-request endpoint exists in our code. GET history of orders is permitted reading. Do not attempt a live trade to test permissions. If scope introspection is unavailable, record that limitation and obtain owner confirmation; the server allowlist still prevents sending trading calls.

Use fixed server egress IPs for key restrictions. Accept the key/secret once over TLS into a write-only credential form; redact its entire body from logs, analytics and error capture. The browser never receives stored credentials. Validate only approved read endpoints and the returned account identity. Model Invest and ISA separately rather than assuming one key grants both. Use polling; no push feed is promised. Begin with daily ledger refresh and hourly valuation refresh where approved; manual refresh is coalesced and rate-limited. Show observation timestamps and delayed-data wording.

Preserve each monetary field’s declared currency: transaction or instrument currencies can differ from primary-currency account totals. Do not invent wallet balances or double-convert values. Treat `FEE`, dividends, lending interest and corporate actions distinctly. Preserve unknown event types, flag reconciliation gaps, and avoid calculating tax liabilities or definitive investment returns from an incomplete history. Pies are not required for MVP correctness.

## 4. Capability and adapter contracts

**Decision:** capabilities are data, checked per connection/account and shown in the UI; an unsupported feature returns a typed unsupported result, never an empty successful balance.

| Capability                 | Bank adapter                           | Trading 212                                       | Manual/CSV                   |
| -------------------------- | -------------------------------------- | ------------------------------------------------- | ---------------------------- |
| Account identity/balances  | Institution-dependent                  | Supported-account summary                         | User supplied, dated         |
| Spending transactions      | Booked; pending if exposed             | Cash/investment activity is not ordinary spending | Imported with provenance     |
| Holdings/investment events | Not assumed                            | Supported read endpoints                          | User supplied                |
| Incremental sync           | Cursor or bounded date-window strategy | History pagination and overlap                    | File/import identity         |
| Credentials/consent        | Provider-specific consent lifecycle    | Revocable key/secret                              | None                         |
| Child/pension coverage     | Individually verified later            | Not supported by this plan                        | Explicitly labelled fallback |

**Fact:** Plaid’s Investments product currently lists US/Canada, while Transactions includes the UK; it is not a verified UK investment/pension solution. [7](https://plaid.com/docs/financial-insights/)

The `ConnectionsModule` owns provider clients, credentials, connection lifecycle, capability records and ingestion. The ledger owns normalized records; analytics consumes authorized ledger projections. No analytics or local-AI module imports provider SDKs.

```ts
interface ReadOnlyAccountAdapter {
  capabilities(ctx: ConnectionContext): Promise<AccountCapabilities[]>;
  beginConsent(ctx: OwnerContext): Promise<ConsentStart>;
  completeConsent(ctx: BoundCallbackContext): Promise<ConnectionResult>;
  listAccounts(ctx: ConnectionContext): Promise<ProviderAccount[]>;
  readBalances(ctx: AccountContext): Promise<BalanceSnapshot[]>;
  readPage(ctx: StreamContext, checkpoint: Checkpoint): Promise<PageResult>;
  disconnect(ctx: ConnectionContext): Promise<RevocationResult>;
}
// PageResult: pending(requestId, retryAt) | page(records, next, removedIds)
// Checkpoint: opaque provider cursor OR window + continuation + watermark
// Optional holdings/activities methods are capability-gated.
```

Key authentication uses a dedicated `validateReadOnlyCredentials` method instead of fabricating an OAuth flow. Methods express business capabilities rather than assuming every provider implements the same authentication or incremental semantics. Ship versioned normalization schemas and fixture-based contract tests; an unknown enum is retained as `UNCLASSIFIED`, not dropped.

## 5. Connection sequences and application API

### Bank connection

1. Authenticated owner requests a connection. NestJS checks membership and records owner, household, provider, random one-use state, expiry, allowed return URI and requested scopes. Initially all partner grants are `NONE`.
2. NestJS starts the provider-hosted journey. Bank authentication happens at the bank/provider’s supported redirect flow. The app never proxies credentials or embeds a bank login form.
3. For TrueLayer v3, use an application `client_credentials` token with `data` scope and create `/v3/data-connections`; request recurring access and only accounts, balance and transactions as needed. Return the provider’s hosted URI. Do not use the v1 refresh-token architecture for v3. [3](https://docs.truelayer.com/docs/enable-your-users-to-connect-their-bank-account) [15](https://docs.truelayer.com/docs/create-a-connection-v3)
4. The callback consumes the bound state exactly once. Verify connection status with the provider; a browser success parameter is not evidence of authorization. Retrieve account identities, persist the owner’s selected accounts and enqueue initial backfill.
5. The owner separately chooses each partner’s `NONE`, `TOTALS` or `TRANSACTIONS` grant. Import progress reports coverage, errors and freshness. A cancelled journey does not become a healthy connection.

### Background ingestion

TrueLayer v3 transactions are asynchronous: POST a date-range request, persist its request ID, then obtain the result by GET. Each next cursor creates another request; repeat reads of the same request return the same page. Pending transactions may fall outside the requested settled-date window. [16](https://docs.truelayer.com/reference/connected-accounts-create-transactions-request) [17](https://docs.truelayer.com/reference/connected-accounts-get-transactions-request)

Plaid uses `/transactions/sync` for added, modified and removed records; complete all pages before publishing the new checkpoint. Restart the update from its original cursor on a pagination-mutation error. Webhooks enqueue work, with signature verification and duplicate protection. [18](https://plaid.com/docs/transactions/sync-migration/) [19](https://plaid.com/docs/api/products/transactions/)

Never pass a remembered or fabricated user IP on a background request to claim user presence. Apply the provider’s actual unattended limits and bank-specific budgets. Default to two scheduled bank refresh attempts daily only where the approved budget supports the required page calls; otherwise defer. Confirm counting of pages, polls and retries during the production spike.

### NestJS application endpoints

H means `/v1/households/{householdId}`. [07](07-api-and-frontend-specification.md) owns the canonical public contracts; callbacks and provider webhooks remain separately authenticated routes.

| Endpoint                                              | Authorization and result                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `POST H/connections/start`                            | Current member becomes owner; server selects approved provider/configuration; returns connection ID and hosted URL |
| `GET /v1/connections/callback/:provider`              | Bound one-use state; session-safe completion; no caller-controlled household/account reassignment                  |
| `POST H/connections/trading212`                       | Owner only; approval flag and supported-account gate; write-only credentials; returns safe status                  |
| `POST H/connections/:id/sync`                         | Owner only; `202 {jobId,nextEligibleAt}`; duplicate requests coalesce                                              |
| `POST H/connections/:id/reauthorize`                  | Owner only; provider-specific renewal flow bound to the existing connection and account identity                   |
| `GET H/accounts`                                      | Only visible accounts and permitted projection; safe freshness/capability fields                                   |
| `PUT H/accounts/:id/grants/:memberId`                 | Owner only; level plus expected version; validated current household member                                        |
| `DELETE H/connections/:id`                            | Owner only; local access stopped immediately; upstream disconnect attempted asynchronously                         |
| `POST H/imports/preview`, `POST H/imports/:id/commit` | Owner-bound import; preview errors/deduplication; idempotent commit                                                |

Use `Idempotency-Key` on application mutations, scoped to actor, route and payload hash. Reuse with changed payload returns `409`; expired state returns a restart-required error. Never return raw provider errors containing identifiers or secrets.

Persist consent scopes, capture time, provider expiry, last successful authorization and revocation time. Drive renewal prompts from provider state; do not hardcode one universal 90-day lifecycle or reuse TrueLayer v1 renewal endpoints for v3. Confirm v3 renewal/revocation contracts during B1. Reauthorization requires the account owner and does not expand partner grants. Disconnect and deletion of retained history are distinct user actions, governed by the retention policy and provider terms.

## 6. Data ownership, grants and credentials

Minimum tables: `Connection`, `ProviderAccountLink`, `Account`, `AccountOwner`, `AccountGrant`, `ConnectionSecret`, `SyncCheckpoint`, `SyncRun`, `Job`, `SourceRecord`, `Transaction`, `InvestmentEvent`, `Instrument`, `HoldingSnapshot`, `BalanceSnapshot`, `ImportBatch`, `AuditEvent`. Every financial row includes household/account scope. Provider identifiers are namespaced by provider, environment and connection/account; they are not global authorization keys.

Separate the connecting member, verified account ownership/co-ownership, household membership and viewing grant. One adult cannot authorize the other adult’s sole account merely by knowing an account ID. Joint-account metadata does not silently grant every household member visibility. Duplicate-account consolidation requires verified identifiers and authorized confirmation; retain separate connection provenance. Count a confirmed duplicate only once in net worth.

| Grant          | Partner-visible data                                                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NONE`         | No account existence, amount, transactions, holdings or derived details                                                                              |
| `TOTALS`       | Approved balance/value totals, currency and observation time; no transaction history, holding names, merchant/category details or underlying records |
| `TRANSACTIONS` | Totals and full permitted detail, including holdings and investment activity                                                                         |

Authorization applies to queries, exports, search, notifications, budgets, cached dashboards and AI inputs. A household total includes only accounts visible to that viewer and is labelled accordingly. Transaction-derived reports require `TRANSACTIONS`; a total-only grant is not permission to disclose category totals. Cache keys include viewer and grant version. Grant removal invalidates derived artifacts and pending AI jobs. Household administration alone does not override account-owner grants.

Use KMS envelope encryption for provider secrets, with authenticated encryption and binding to connection/owner/context. Keep only ciphertext, encrypted data key, nonce and key version in Postgres. Server integration code can decrypt; this is a cloud operational database with local inference, **not end-to-end encryption**. Use the EC2 instance role, narrowly scoped KMS permissions, redaction, rotation and audited credential access. Retained raw payloads require encryption, restricted access and a documented short retention period.

The local inference agent receives only an authorized, minimized data package through an expiring app capability. It never receives API keys, bank tokens, connection secrets or database credentials. Stop and purge queued local jobs after authorization changes; already displayed/downloaded information cannot be remotely unlearned or recalled.

## 7. Correct synchronization and financial normalization

**Decision:** each PostgreSQL job has a unique deduplication key, lease, heartbeat, attempt count and `runAfter`. Claim jobs with `FOR UPDATE SKIP LOCKED`, then release the transaction before networking. A per-connection/stream lock prevents overlapping syncs. Workers use fencing generations so an expired worker cannot overwrite a newer checkpoint.

Stage each page durably with an ingestion ID and payload hash. Upsert normalized records idempotently. Atomically publish a completed change batch with its checkpoint; a failed page never advances the committed cursor. A restart can replay staged pages safely. Keep page continuation separate from the durable incremental watermark. Do not interpret a cursor as an event ID or assume it survives an unlimited delay.

For date-window providers, use a fixed end time, overlap the previous window, and periodically rescan a longer permitted range for corrections. Initial target is 90 days where available, with older history subject to provider support; decide Plaid's requested history at initial connection, because extending it later can require recreating the Item. Record actual `coverageFrom`, gaps and partial status; do not fabricate opening balances. Reauthentication matches a known account using verified stable identifiers and preserves its local ID, without trusting a display name or last four digits alone. [19](https://plaid.com/docs/api/products/transactions/)

Canonical cash is `{amountMinor: string, currency: string}`, stored as signed PostgreSQL `BIGINT` minor units: credits/inflows positive, debits/outflows negative. Preserve raw provider decimals separately; holdings, unit prices and rates use exact `NUMERIC`/decimal arithmetic. Follow the HALF_UP rounding boundaries in 03; never calculate financial values with JavaScript binary floats. Keep transaction date, booking date, value date and source timezone separately; date-only bank values remain date-only. Store provider booking status, raw description, normalized description, observed time and source revision. Display time in Europe/London without changing economic dates.

Deduplicate principally on stable provider/account/event identity. When identity is absent or unstable, retain ambiguous same-date/same-amount purchases as distinct; heuristic hashes suggest review rather than destructive merging. CSV deduplication uses file hash, source row identity and account; overlapping API/import data requires reconciliation, not blanket deletion.

Pending items are provisional, excluded from finalized spending but optionally included in a clearly labelled forecast. Plaid can remove a pending ID and add a different posted ID on separate pages; use its explicit linkage when present. Preserve user categories through a supported replacement relation. Disappearing pending items are not automatically booked spending. [20](https://plaid.com/docs/transactions/transactions-data/)

Credit-card repayments and transfers between owned accounts must not count twice as spending. Retain both ledger legs; match opposite amounts/currency, timing and references with confidence and user correction. A deposit into an investment account is an external investment contribution, not investment profit. Cross-currency transfers need linked currency amounts and documented FX; missing evidence remains unmatched. One-sided transfer data stays visible with an unresolved label.

Holdings snapshots describe a point in time; they are not synthesized from incomplete trade history. Reconcile total valuation against the provider summary using documented component semantics and tolerance. Do not add reserved cash twice or add separate fees again when already reflected in net amounts. Preserve corporate actions as distinct event types; unexplained changes produce a reconciliation issue, not an invented purchase or gain.

## 8. Failure handling and acceptance gates

| Failure                              | Required behavior                                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Rate limit, timeout, provider outage | Honor retry metadata, exponential backoff/jitter, circuit breaker; preserve last successful data with stale timestamp |
| Revoked/expired consent or key       | Stop ingestion, mark reconnect required; no endless credential retries                                                |
| Bad scope or unsupported account     | Explain missing capability; never request trading privileges to fix read access                                       |
| Partial history/page/schema failure  | Keep committed checkpoint; mark partial coverage; quarantine unknown records                                          |
| Owner disconnects during sync        | Increment revocation generation; reject late writes; cancel jobs; remove credentials after upstream revoke attempt    |
| Upstream revoke unavailable          | Local access stops immediately; tell owner how to revoke at provider; track unresolved upstream state                 |
| Provider ID changes                  | Reconcile verified account identity; no automatic duplicate total or cross-owner merge                                |

Acceptance tests must demonstrate:

1. A real supported UK account completes approved consent and produces reconciled balance/booked transactions; a later refresh ingests real changes.
2. Approved live Trading 212 access retrieves an owned supported account and reconciles summary, holdings and available history. Demo data is visibly separated.
3. Replayed callbacks, retries, duplicate webhooks, overlapping imports, mid-page crashes and changed pending IDs do not double-count or skip committed data.
4. Two households with deliberately colliding provider IDs remain isolated across every read/write/job/export path. A second adult cannot attach, refresh, disconnect or change grants on the first adult’s account.
5. `NONE`, `TOTALS` and `TRANSACTIONS` hold for UI, API, exports, caches, aggregates and local inference; revoke during sync/AI execution fails closed.
6. Trading/payment routes are absent from the adapter allowlist; logs and exception traces contain no credentials; keys can be rotated and revoked.
7. Unsupported account types, missing currencies, fee events, splits, transfers, stale snapshots and provider outages display truthful status without inventing zero balances or profit.

**Founder connected MVP exit:** B1–B3, T1–T2 and the applicable tests pass. Without either real feed, call the result an **import/manual prototype** or **bank-connected partial milestone**, explicitly listing the missing integration. CSV/manual entry remains a useful fallback and future-provider bridge, but does not satisfy the connected MVP.

Future pensions, brokers and children’s accounts each require a fresh capability, ownership, contractual and production assessment. Add guardian/beneficiary distinctions before child-account linking; parent status alone is insufficient evidence of API authority. Never advertise universal UK investment or child-account coverage.

## Primary sources

All sources below checked **22 October 2026**. Technical and commercial approvals must be rechecked before implementation and launch.

1. [FCA — AISP models under PSD2](https://www.fca.org.uk/firms/agency-models-under-psd2).
2. [FCA Handbook — PERG 15](https://handbook.fca.org.uk/handbook/perg15).
3. [TrueLayer — Data API v3 overview](https://docs.truelayer.com/docs/enable-your-users-to-connect-their-bank-account).
4. [TrueLayer — v1 overview and recommendation to use v3](https://docs.truelayer.com/docs/data-api-basics).
5. [Plaid — Pricing, UK/EU Custom plans and Trial limitations](https://plaid.com/docs/account/billing/).
6. [Plaid — Production launch checklist](https://plaid.com/docs/launch-checklist/).
7. [Plaid — Financial insights product/country comparison](https://plaid.com/docs/financial-insights/).
8. [Enable Banking — Restricted own-account production mode](https://enablebanking.com/docs/api/linked-accounts/).
9. [Enable Banking — FAQ: contracts, KYB, pricing and API semantics](https://enablebanking.com/docs/faq/).
10. [Enable Banking — Institution availability directory](https://enablebanking.com/open-banking-apis/) — exact UK account coverage remains unverified.
11. [Trading 212 — Public API](https://docs.trading212.com/api).
12. [Trading 212 — API key and permissions](https://helpcentre.trading212.com/hc/en-us/articles/14584770928157-Trading-212-API-key).
13. [Trading 212 — API Terms, especially 4.2, 6.2–6.3, 6.7 and 7.1](https://www.trading212.com/legal-documentation/API-Terms_EN.pdf).
14. [Trading 212 — Official OpenAPI schema](https://docs.trading212.com/_bundle/api.json?download=).
15. [TrueLayer — Create a v3 connection](https://docs.truelayer.com/docs/create-a-connection-v3).
16. [TrueLayer — Create an asynchronous transactions request](https://docs.truelayer.com/reference/connected-accounts-create-transactions-request).
17. [TrueLayer — Retrieve a transactions request](https://docs.truelayer.com/reference/connected-accounts-get-transactions-request).
18. [Plaid — Transactions Sync](https://plaid.com/docs/transactions/sync-migration/).
19. [Plaid — Transactions API](https://plaid.com/docs/api/products/transactions/).
20. [Plaid — Pending and posted transaction states](https://plaid.com/docs/transactions/transactions-data/).
