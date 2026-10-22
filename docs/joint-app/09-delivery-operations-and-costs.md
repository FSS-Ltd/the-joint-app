# The Joint App — Delivery, Testing, Operations and Costs

**As of:** 22 October 2026. Cost and schedule ranges are planning estimates, not supplier quotes or work already completed.

## 1. Delivery plan and effort

| Phase                             | Working deliverable                                                                         | Engineer-days |
| --------------------------------- | ------------------------------------------------------------------------------------------- | ------------: |
| 0 — Feasibility and access        | Account inventory, provider gates, cost model, pinned stack and approved technical baseline |           3–5 |
| 1 — Foundation and manual finance | Two adults, privacy controls, imports, spending and budgets                                 |          8–12 |
| 2 — Connected accounts            | Approved bank and brokerage adapters, reliable ingestion and reconciliation                 |         12–18 |
| 3 — Wealth and goal projections   | Assets/debts, children, allocations and tested scenarios                                    |          8–12 |
| 4 — Local AI and founder MVP      | Paired Mac, supported explanations, founder review and recovery rehearsal                   |          8–13 |
| 5 — Mobile and public MVP         | Native apps, subscriptions, security/store review and operational launch                    |         13–20 |
| **Total**                         | **Complete planned public MVP**                                                             |     **52–80** |

Phases 0–4 total **39–60 engineer-days**, roughly 8–12 focused working weeks. All six phases total roughly 11–16 focused weeks; allow a practical **12–20 calendar weeks** for integration learning and external review. These are not guaranteed dates. At 15 focused engineering hours/week instead of a five-day week, use engineer-hours rather than pretending the same calendar schedule applies.

Provider approval, legal review, app-store review, an observed monthly founder review and supplier procurement are elapsed-time dependencies. Start requests early; they can exceed implementation time. AI coding tools can accelerate routine implementation, but cannot remove those dependencies or prove financial correctness.

The individual [phase plans](00-README.md) define tasks and acceptance evidence. A blocked connector does not block all manual, projection or mobile preparation, but it does block claiming that connector complete.

## 2. Monthly infrastructure budget

GBP ranges include reasonable planning slack, not a live currency conversion. Vendor billing may be in USD, plus applicable taxes. Re-price in the chosen region before provisioning.

| Stage                                      | Application/worker compute |                            DB/auth | Backups, storage, email, security and monitoring | Approx. fixed total |
| ------------------------------------------ | -------------------------: | ---------------------------------: | -----------------------------------------------: | ------------------: |
| Synthetic local development                |           Existing machine | Local/free isolated test resources |                                          Minimal |               £0–20 |
| Founder production                         |                     £30–65 |                             £20–35 |                                           £10–40 |         **£60–140** |
| Public, about 100 paying households        |                    £45–110 |                            £25–100 |                                          £50–140 |        **£120–350** |
| Early scale, about 1,000 paying households |                   £100–300 |                            £60–250 |                                          £90–250 |        **£250–800** |

These are workload assumptions, not capacity promises. Measure household count, active users, transactions, provider refreshes, database size and job latency. Free users still incur storage/auth/support costs and must be counted in capacity and unit economics.

Supabase currently lists Pro from **US$25/month**, with one project's small compute covered by included credit and daily backups retained seven days; add-ons and larger/multiple projects cost more. Use a paid database baseline for real founder finances. [Official pricing](https://supabase.com/pricing).

The VM estimate must include EC2, disk, public IPv4, snapshots and relevant traffic; do not count only the instance headline. [AWS EC2 pricing](https://aws.amazon.com/ec2/pricing/on-demand/). The founder compute allowance covers the small web/API host and separate worker host required for distinct IAM roles. Candidate 2–4 GB and 1–2 GB sizes are starting configurations, not benchmark results; re-price both plus network/disk costs.

### Excluded costs that need separate decisions

- Bank aggregator minimums, onboarding, users/connections/accounts, refreshes and enrichment.
- Brokerage/market-data licences and written approvals.
- Payment processing, store commissions, RevenueCat and billing/tax tooling.
- Developer-program fees, domain purchase, signing/notarization and test devices.
- Qualified financial-perimeter/privacy/consumer-contract review and penetration testing.
- Founder/developer pay, acquisition, customer support and business taxes.
- New always-on Mac hardware and electricity; no new machine is assumed for the pilot.

Keep each exclusion visible in the budget. Do not describe £60–140 as the complete cost of a commercial connected-finance service.

## 3. Cost model to implement

Track provider usage per connection and household, with no merchant/financial detail in metrics. The pricing sheet uses the supplier's actual charging unit and allocated minimum.

`Monthly service cost = fixed infrastructure + provider minimums + metered connector charges + billing fees + support/operations + local hardware/electricity allocation`.

Per-household revenue must be measured after applicable tax and channel fees. The [commercial specification](06-paywalls-and-mobile-launch.md) models the £5.99/month and £59.99/year hypothesis. Its low-cost 100-household illustration leaves only about £1.13 per household/month for connectors while retaining 20% of receipts before founder pay and tax. That is an internal sensitivity result, not a supplier price.

Use spend alerts at 50%, 80% and 100% of agreed monthly budgets. Prevent refresh storms with per-provider and per-household quotas. Do not solve a cost problem by silently removing paid features already promised to customers.

## 4. DevEx and CI/CD

Use short-lived branches and small pull requests into a protected main branch. Each phase ends in a tagged working version; every PR includes the problem, behaviour change, verification and rollback note. Optional commitlint/Husky/lint-staged improve consistency but must not conceal CI failures.

Package names are `@joint/web`, `@joint/mobile`, `@joint/api`, `@joint/worker`, `@joint/companion` and corresponding `@joint/*` shared packages. Define these scripts during scaffolding; commands in phase documents are proposed package scripts, not assertions that a repo already exists.

Required PR pipeline:

1. Frozen-lockfile install on the pinned Node/pnpm versions.
2. Formatting, ESLint, TypeScript and package-boundary checks.
3. Domain/projection unit and property tests.
4. Database migration plus API integration tests against disposable Postgres.
5. Changed provider fixtures/contract tests with network disabled by default.
6. Critical Playwright journeys and, when relevant, native/companion checks.
7. Secret/dependency/container scan and a build of affected deployables.
8. Synthetic preview; no production data or live provider tokens.

Use GitHub OIDC for deploy identity. Build immutable images, scan and record digests. Deploy staging, smoke-test, apply compatible migrations, then promote the same artefacts. Mobile releases use reviewable EAS builds with signed credentials and store submissions; ship native-runtime changes through the stores rather than assuming an over-the-air update can change native code.

Rollback the previous application image when schema compatible. A schema rollback that would destroy new records is not an automatic first move: use expand/contract, a forward fix and tested recovery where needed. Maintain mobile API compatibility across at least the currently supported and previous released client versions.

## 5. Testing strategy by risk

| Layer              | Priority tests                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Pure domain        | Cash exactness, transfer/card logic, goal allocation, currencies, valuation identity          |
| Projection engine  | Zero/negative growth, leap/month ends, fees/inflation, depleted and beyond-horizon states     |
| Database           | Tenant-matched foreign keys, real RLS role, pooled context, concurrency/uniqueness            |
| Provider contracts | Actual approved fixture schemas, missing fields, pagination, pending replacement, rate limits |
| API integration    | Owner/member access, idempotency, grant changes, error sanitisation                           |
| Web E2E            | Invite → import/connect → review → goal → revoke → export                                     |
| Companion          | Pairing, key loss, sleep, expired leases, altered/replayed output, revoked source             |
| Billing/native     | Purchase/renew/cancel/grace/hold/refund/restore, deep links, different adult/store identities |
| Recovery           | Restore, deletion-ledger replay, provider-token revocation and resync                         |

Testing begins with critical financial and isolation paths. Avoid large suites that merely reproduce a function's own implementation. For forecast math, use independent known answers/closed-form checks and invariant tests. For provider integrations, sandbox tests do not replace the approved real-account acceptance run.

Security release gate: zero unresolved critical/high findings in account isolation, credential handling, deletion, billing identity and companion disclosure. A model evaluation score cannot override a single unauthorised disclosure.

## 6. Observability and SRE-lite

Use structured logs with request/job/connection IDs, stable error codes and durations. Redact auth headers, cookies, keys, request bodies and financial text before they enter any exporter. OpenTelemetry traces may join API and worker operations but contain no financial payload. Error tracking must disable session replay for authenticated finance views.

Monitor:

- API p95 latency, error rate, DB saturation and connection use.
- Scheduled sync completion, last-success age, provider failures, consent expiry and quota usage.
- Queue depth, oldest job age, lease expiries and repeated attempts.
- Import rejects, reconciliation mismatches and suspected duplicates.
- AI device availability, expiry/failure rate and evidence-validation failures.
- Billing webhook lag, entitlement drift, provider cost per active household.
- Backup completion, restore age and deletion cleanup failures.

Targets to validate: founder API monthly availability 99.5%; public API 99.9%; ordinary cached/DB-backed dashboard p95 below one second excluding provider/model wait; queued refresh starts within five minutes when provider budget permits. These are internal objectives, not marketed SLAs. Show provider freshness separately from application uptime.

Expose `/health/live` without secrets and `/health/ready` checking essential dependencies. A brokerage outage does not make the entire app unready. The companion advertises heartbeat/model status separately.

## 7. Backups, disaster recovery and deletion

Founder target: **RPO <=24 hours, RTO <=8 hours**. RPO is potential data loss; RTO is restoration time. Daily managed backups plus encrypted, independently held logical copies cover the private stage; recover auth configuration, application schema, required key metadata and object manifests too.

Public target: **RPO <=1 hour, RTO <=4 hours**, only after selecting and testing an affordable approach: managed PITR or measured hourly encrypted logical snapshots plus restoration of required objects/configuration. Price any PITR add-on and database-compute requirement explicitly. If the target cannot be met inside budget, revise the published launch scope and costs rather than claiming compliance.

Retain backups according to the security document, normally up to 30 days for independent sets. Restore into an isolated environment at least monthly during active development and quarterly after stable operation, and after significant schema/backup changes. Run founder restore before first real-data release and public restore before charging.

A restore rehearsal proves: current app can read data; balances/counts reconcile; no tenant isolation has weakened; keys are available through authorised KMS; deleted users/data are not resurrected after deletion-ledger replay; obsolete provider credentials are not reused. Re-importable bank data does not excuse losing unrecoverable manual notes, grants or goal decisions.

## 8. Top three runbooks

### R1 — Provider outage, consent failure or stale balances

Detect the affected provider/connection. Pause only failing refreshes, honour backoff, preserve last valid snapshots and show source-as-of dates. Verify whether the fault is credentials, quotas, upstream availability or schema drift. Never loop consent or demand write permission. Re-enable through a canary connection, replay idempotently and reconcile before declaring recovery.

### R2 — Wrong balances, duplicate imports or suspected cross-account data

Stop affected ingestion and projection publication. Preserve evidence and source versions. Determine whether the cause is duplicate identity, pending/booked mapping, currency, aggregation or scope. Contain access immediately if privacy may be affected. Repair through reviewed reversible migrations/jobs, rebuild aggregates, compare statements and invalidate derived insights. Do not edit provider originals to make totals look right.

### R3 — Lost device, exposed credential or unauthorised disclosure

Revoke device/app sessions and pause related connections. Rotate affected provider keys and cryptographic secrets as required; disable evidence delivery. Preserve payload-free audit evidence, determine affected users/data, involve the designated incident owner and assess statutory/user notification duties. Recover with fresh pairing/credentials and a targeted regression test. Re-enable only after the actual exposure path is closed.

## 9. Definition of done

Every feature has a visible working flow, server-side permission enforcement, exact-money handling where relevant, meaningful tests, safe errors, telemetry, migration/rollback notes and updated documentation. Every phase records observed results and open gates. A screenshot, stub, sandbox success or passing model-generated test alone is not completion of a real connected-finance feature.
