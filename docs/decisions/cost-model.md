# CSV-first cost model and spend authority

Task 0.5, 23 October 2026. No supplier quote, cloud resource, customer revenue or actual fee rate is claimed. No new paid commitment is authorised. Production budget is awaiting a founder decision; local development can continue independently.

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

Current authorised new recurring spend: £0 until a concrete deployment/service purchase is approved. This is an authority boundary, not the estimated operating cost of the app. Production target budget is not selected. Record the founder's eventual ceiling and separate that planning limit from explicit purchase/deployment permission. Do not upgrade subscriptions or provision infrastructure based on a planning estimate.
