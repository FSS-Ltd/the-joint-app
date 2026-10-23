# CSV-first cost model and spend authority

Task 0.5, 23 October 2026. No supplier quote, cloud resource, customer revenue or actual fee rate is claimed. No new paid commitment is authorised. The founder confirmed an existing Vercel Pro subscription and a £0 additional monthly hosting budget. Treat the existing subscription as already covered, rather than a new project charge; do not claim infrastructure is costless.

## Cost inventory

| Class                 | Current treatment                                                                       | Evidence before spending/charging                                                                           |
| --------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Local development     | Existing machine/Docker; no new cloud provisioning or model download                    | Actual existing subscriptions, hardware/electricity and developer time are separate costs, not assumed zero |
| Fixed cloud           | Web/API and worker compute; DB/auth; disk; IP/network; backups/objects/email/monitoring | Dated region-specific configuration/quote and approved ceiling; include free-user load                      |
| Variable usage        | Storage/egress/auth/email/import/job workload                                           | Measured per-household usage, quotas and current provider billing units                                     |
| Live source contracts | Excluded from current MVP feature scope, not priced “free”                              | Reopen bank/broker procurement before any post-MVP API work                                                 |
| Payments/stores       | Not active; rates/eligibility unverified                                                | Actual channel fees, revenue service fees, store/tax handling, refunds/restore and contract terms           |
| Reviews/operations    | Security/privacy/perimeter/accounting, support, restore exercises                       | Quoted effort and named owner; do not hide inside cloud estimates                                           |
| Developer/hardware    | Not included in illustrative service margin                                             | Explicit time, replacement and availability costs before a commercial decision                              |

The [Supabase pricing page](https://supabase.com/pricing), checked 23 October 2026, advertises Pro from US$25/month. This is a vendor headline, not a GBP all-in deployment quote or authorisation to buy. [Backups](https://supabase.com/docs/guides/platform/backups) document seven days of daily Pro backups; independent objects/config/deletion recovery remains additional work/cost. [AWS on-demand pricing](https://aws.amazon.com/ec2/pricing/on-demand/) varies by chosen region/resources; include disk, public IP, egress and snapshots rather than an instance headline alone. No exchange rate or cloud configuration is assumed here.

## Calculation contract

Monthly service cost = fixed infrastructure + metered usage + billing/channel fees + support/operations + allocated hardware/time costs. Live source costs enter only when those features are separately approved.

Monthly gross revenue = paying households × monthly price, or paying annual households × annual price / 12 for revenue normalisation. Annual cash received is not twelve monthly payments. Net receipts require actual applicable tax, platform/payment/revenue fees, refunds and channel mix; none are verified here. Count free-household load in costs. Do not declare the provisional £5.99/month or £59.99/year price viable until actual inputs and user demand support it.

## Explicit sensitivity example — not a quote or forecast

Assume 100 paying households, no free users, provisional prices above, an invented combined 20% receipts deduction and illustrative fixed service costs of £120/£350 per month. Taxes/support/developer pay, refunds, acquisition, extra usage and hardware are NOT included, so the remainder is not profit or an approved margin. The 20% factor is a sensitivity parameter, not any provider's real fee/tax rate. Round only displayed results; use unrounded Decimal calculations.

| Channel           | Gross per household/month | Hypothetical fixed/month | Receipts after illustrative 20% | Remainder before excluded costs | Remainder/household |
| ----------------- | ------------------------- | ------------------------ | ------------------------------- | ------------------------------- | ------------------- |
| Monthly           | £5.9900                   | £120.00                  | £479.20                         | £359.20                         | £3.5920             |
| Monthly           | £5.9900                   | £350.00                  | £479.20                         | £129.20                         | £1.2920             |
| Annual, per month | £4.9992                   | £120.00                  | £399.93                         | £279.93                         | £2.7993             |
| Annual, per month | £4.9992                   | £350.00                  | £399.93                         | £49.93                          | £0.4993             |

No actual bank/broker quote exists and none is required for the current CSV/manual MVP. If live sources return, redo this calculation with the real supplier charging unit/minimum, free users and channel mix before promising a price. Commercial approval remains held even when all software CI is green.

## Spend ceiling and controls

Current authorised new recurring spend: £0 until a concrete deployment/service purchase is approved. This is an authority boundary, not the estimated operating cost of the app. Production target: £0 additional monthly hosting cost, using the existing Vercel Pro subscription and a free database. Separate that planning limit from explicit purchase/deployment permission. Do not upgrade subscriptions or provision infrastructure based on a planning estimate.

## Existing Vercel Pro and free database — 23 October 2026

The founder reports an existing Vercel Pro plan. Plan Next.js and NestJS hosting within that subscription's remaining included allocation; no additional subscription, seat, add-on or usage charge is authorised. Actual team entitlement, remaining shared credits, usage and billing controls are unverified. The existing subscription is excluded from incremental project spend but should still appear in any future fully allocated commercial cost model. The sensitivity figures above remain hypothetical stress scenarios, not the selected launch budget.

[Vercel supports NestJS as a Function](https://vercel.com/docs/frameworks/backend/nestjs). [Pro cron scheduling](https://vercel.com/docs/cron-jobs/usage-and-pricing) supports intervals down to one minute; invocations consume Function usage. Keep the independent local worker, but use a bounded invocation of shared job logic for eventual hosted execution. Do not deploy its polling loop as a permanent Function or introduce a paid worker host.

[Spend Management](https://vercel.com/docs/spend-management) applies to metered usage across the team beyond included credit. Notifications alone do not stop usage. Automatic production pausing affects all team projects, runs with a delay, and excludes some continuing charges, so it cannot prove a strict £0 overage guarantee. Inspect remaining allocation, workload budgets and project-specific controls before deployment; do not change shared team billing settings or pause other projects without explicit approval. No billing settings changed here.

Target Supabase Free for PostgreSQL/Auth, subject to actual account capacity, London availability and launch checks. [Current Free limits](https://supabase.com/pricing) include 500 MB database storage and pausing after one week of inactivity. Do not promise always-on availability. Free-tier [backup guidance](https://supabase.com/docs/guides/platform/backups) requires a separate export/recovery process: verify encrypted database, object and configuration recovery before real data; never put financial backups in public Git or public CI artifacts. Paid upgrades remain unauthorised.

This is a deployment planning amendment. No cloud resources, production deployment, vendor contract, billing change or real-data approval is implied. Local synthetic implementation can proceed after this amendment's PR/CI/merge gate.

Deployment hold: the founder requires all application execution and data to remain local until the MVP is complete and explicit deployment approval is given. Do not create hosted previews, staging or production deployments, connect automatic deployment hooks, or provision hosted app/database resources before then. Authorised public source delivery and synthetic GitHub Actions CI continue; they do not authorise application hosting.
