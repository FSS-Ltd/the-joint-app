# The Joint App — Product Specification

**Status:** Proposed implementation baseline, ready for refinement and phased execution.

**Prepared:** 22 October 2026, UK launch assumptions.

**Owners:** pilot households for the founder release; adult UK households for the public release.

**Purpose:** Understand the household's money, agree achievable goals, and track progress using connected accounts and private local AI inference.

This is a technical product plan. It does not recommend securities, tax treatments, borrowing products, or a particular personal investment strategy. All example balances and rates are synthetic.

## 1. Executive summary

The Joint App brings spending, debts, savings, investments and children's assets into one permission-aware household view. It answers: Where did our money go? What do we own and owe? What have we put aside? When could we reach a goal if these assumptions hold? What spending changes would alter that date?

Build a useful manual foundation first, then connect supported accounts, add deterministic forecasts, and run an AI assistant on a paired household computer. Package a native mobile experience and paid household entitlements once the founder version is dependable.

The initial application is a read-only financial organiser. It neither holds money nor initiates trades, payments or transfers. Connecting an account does not authorise the app to move funds.

## 2. Requirements supplied and assumptions

| Item                                      | Classification                              | Baseline                                                                                                     |
| ----------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Spending habits, net worth, savings goals | User requirement                            | Core product                                                                                                 |
| Adult and children's investment accounts  | User requirement                            | Track ownership, balances and holdings where sources support them                                            |
| Direct account data and Trading 212       | User requirement with external dependencies | Approved bank connector and permission-gated Trading 212 adapter                                             |
| Local AI such as Gemma 4                  | User requirement                            | Mac companion first; no automatic cloud model fallback                                                       |
| Web, later marketable mobile app          | User requirement                            | Next.js PWA, then Expo iOS/Android                                                                           |
| Future paywalls documented                | User requirement                            | Central entitlements from the start; billing activated for public launch                                     |
| Starting market                           | Assumption                                  | UK adult households; GBP reporting; Europe/London calendar                                                   |
| Household size                            | Assumption                                  | Two adults; parent-managed child profiles; one household per user at launch                                  |
| Personal account visibility               | Product decision                            | Private by default; explicit partner grants                                                                  |
| Hosting                                   | Product decision                            | London application and primary database; local inference                                                     |
| Business finances                         | Scope decision                              | Exclude company books; tag legitimate personal inflows without importing company accounts into family wealth |
| Hardware                                  | Unverified hardware assumption              | Compatible Mac hardware, to be benchmarked and availability confirmed in Phase 0                             |

Do not block writing the plan on unspecified banks, balances or children's providers. Phase 0 obtains that inventory and determines actual connector coverage. No actual account access or provider applications have been performed for this plan.

## 3. Release definitions

### Manual foundation: end of Phase 1

Both adults sign in independently, import records, categorise spending, create budgets and see balances. All sensitive functions use real access controls. This is useful software but does not fulfil the direct-account requirement.

### Connected finance core: end of Phase 3

Approved bank connections refresh automatically; an approved Trading 212 connection imports supported account data if permission has been obtained. Goals, net worth, children's records and deterministic projections work. A statement-only Trading 212 path is visibly labelled as such.

### Founder MVP: end of Phase 4

The couple uses the connected finance core and a paired local AI companion through a full monthly review. Tests prove isolation, reconciliation, projected dates and graceful behaviour when the Mac or providers are unavailable.

**Acceptance is conditional on real connectivity.** If bank production access or Trading 212 permission remains unavailable, label the release “founder beta with partial connectivity” and record the missing requirement. CSV imports cannot silently be counted as a successful live integration.

### Public mobile MVP: end of Phase 5

Native iOS and Android clients, approved subscriptions, clear privacy controls, operator runbooks and measured unit economics are ready. Advertise only approved, tested integrations. A launch with fewer providers is a deliberate scope revision recorded in the decision log.

## 4. Users, ownership and access

### Adult member

Each adult has an individual identity, verified email and independent authentication. They can connect their own accounts, manage their records, grant partner access and revoke it. Household membership is never sufficient authority to read every account.

### Household billing administrator

The member who pays can manage a subscription and invite the second adult. Payment conveys no additional access to the partner's transactions. Administrators cannot reset a partner's credentials or silently transfer account ownership.

### Children

Children are beneficiary profiles, not login identities. Store nickname, optional birth month/year, currency and target dates; avoid legal names, precise dates of birth and documents unless a later verified integration genuinely requires them. Adults record their authority to manage the relevant account. This app does not open investments for a child or establish guardianship. Record verified parent/guardian management authority separately from legal ownership by the child; household membership alone does not confer authority.

### Account grants

| Level        | Visible to the granted adult                                                                   | Hidden                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| NONE         | Nothing about the account in normal screens                                                    | Existence, balances, transactions, holdings, derived insights                                   |
| TOTALS       | Label, account type, value, currency, freshness and permitted aggregate net-worth contribution | Merchants, transaction counts, category spending, securities, quantities and inferred behaviour |
| TRANSACTIONS | Totals plus transaction history, holdings and authorised detailed analysis                     | Provider credentials and account-holder security information                                    |

Amounts visible through TOTALS must not leak more detailed spending by subtraction across widgets. Spending reports use only TRANSACTIONS-granted accounts. A totals-only account can contribute to a labelled net-worth total, not a spending or income baseline.

No implicit sharing with all future household members. A new invitation never expands existing grants. A grant change invalidates caches and affected AI/projection results immediately.

Joint legal ownership is distinct from household UI sharing. Two provider connections to the same joint account must resolve to one canonical financial account after confirmed matching, without disclosing one member's connection to the other without authority.

## 5. Core capabilities and success criteria

| ID  | Capability               | Required outcome                                                                                          |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| R01 | Identity and household   | Two individual accounts, explicit invitation/acceptance, owner-safe exit and deletion                     |
| R02 | Direct banks             | One approved UK provider, real consent journey, accurate booked transactions, revocation and reconnection |
| R03 | Investments              | Read-only supported brokerage balances, cash and holdings; Trading 212 permission gate                    |
| R04 | Imports                  | CSV preview, mapping, duplicate review, rollback and provenance                                           |
| R05 | Spending                 | Calendar-month categories, trends, recurring-payment candidates, corrected classifications                |
| R06 | Budgets                  | Monthly category budgets and remaining amounts; clear “incomplete data” state                             |
| R07 | Net worth                | Assets less liabilities, account-level freshness, no double counting                                      |
| R08 | Goals                    | Target amount/date, allocations, planned contributions and priority                                       |
| R09 | Projections              | Reproducible timelines, assumptions, optimistic/base/cautious labels only when rates supplied             |
| R10 | Children's records       | Separate ownership and liquidity; family combined view is opt-in                                          |
| R11 | Local assistant          | Evidence-backed explanations and cost-cutting scenarios using a paired Mac                                |
| R12 | Shared review            | Common dashboard and monthly review notes containing only mutually authorised data                        |
| R13 | Monetisation             | Server-enforced plan capabilities; founder entitlement; graceful downgrade                                |
| R14 | Mobile                   | Native login, reliable provider redirects, secure credentials, privacy-aware notifications                |
| R15 | Portability and deletion | Export, revoke connections, leave household and delete account without payment                            |
| R16 | Reliability              | Backups restored successfully, stale feeds identified, duplicate jobs safe to retry                       |

Founder success measures: both adults complete onboarding; imported balances reconcile against source statements; a complete month can be explained; known transfers are excluded from spending; each displayed forecast can be reproduced; assistant evidence is inspectable; no real security incident or critical permission defect remains open. These are acceptance goals, not claimed results.

## 6. Primary product journeys

### Set up together

1. Create an adult account, verify email and enrol MFA before connecting real providers.
2. Create the household, choose GBP and Europe/London.
3. Invite the partner with a single-use, seven-day token; accept while signed into the invited email.
4. Explain account visibility before offering any connector.
5. Each adult separately connects/imports an account and chooses its grant.
6. Add child beneficiary records and manually record unsupported assets.
7. Review first balances, duplicates and categories together where permissions allow.

### Review a month

Select a calendar month and authorised account scope. Show posted income, spending, transfers, debt service and net cash movement separately. Drill into category totals; fix misclassifications without altering the provider's original row. Exclude pending transactions from booked reports while showing an optional pending preview.

Compare with the previous complete month and the rolling baseline. Flag missing history and unusual one-off items rather than presenting partial totals as complete. A recurring payment is a candidate for review, not proof that a service is unused.

### Plan a goal

Create a target, currency, date and permitted funding accounts. Allocate existing assets without moving money or inflating net worth. Enter or confirm a monthly contribution. Show whether the goal is already met, reachable, beyond the horizon, or cannot be evaluated with the available inputs. A saved scenario records exactly which changes and assumptions it contains.

When several goals use the same funds, enforce allocation limits and make future contribution priorities explicit. A child-owned or locked asset cannot fund an adult spending goal merely because it appears in the family view.

### Ask the assistant

Example: “What changed in our spending, and what happens if we reduce takeaway spending by £80 a month?”

Show the source period, data freshness and visible account scope. Run deterministic spending and projection tools, then send a bounded evidence packet to the paired computer for explanation. Display suggestions as drafts. Any budget/category/goal change still requires an explicit user action in the app.

### Stop sharing or stop paying

Revoking a partner's access immediately removes affected future views, shared caches and generated results. Cancelling a plan preserves existing authorised history and exports. When paid access ends, stop paid refreshes and new premium jobs according to the entitlement policy. Do not equate leaving a relationship with losing access to one's own financial records.

## 7. Scope boundaries

**Founder must-haves:** R01–R11 plus basic R13/R15/R16. R12 can be a simple review checklist and notes.

**Public mobile must-haves:** all requirements above, real store purchase lifecycle handling, public privacy/terms/support pages and proven provider commercial rights.

**Deferred:** automated money movement; stock selection; trade execution; joint bank-account creation; child logins; tax filing; credit scores; mortgage advice; automated subscription cancellation; live market terminal; multi-household membership; crypto custody; receipt OCR; enterprise accounting; open-ended internet-browsing agents.

## 8. Product language

Use “projected”, “assuming”, “as of” and “based on these accounts”. Distinguish a recorded contribution from investment gain. Never say “guaranteed”, “we see all your accounts”, “bank-grade”, “fully private”, “offline AI on every phone” or “all providers supported” without evidence that the specific claim is true.

User-facing local AI copy: “AI responses run on your paired computer. Account data is stored securely in the app so you can both use it. Your computer must be available for new AI responses.” Explain this before pairing.

## 9. Design principles

- Start with a calm overview, then reveal transaction detail.
- Present each adult's agency and privacy equally.
- Label incomplete coverage and stale values beside the numbers they affect.
- Keep colour secondary to words and icons; target WCAG 2.2 AA.
- Use accessible tables alongside charts, currency-aware formats and no colour-only gain/loss signals.
- Avoid gamification that shames a partner or ranks their spending.
- Preserve user corrections during every re-import and provider refresh.

## 10. Sources and related specifications

This document primarily records product decisions. External restrictions are explained in [account integrations](04-account-integrations.md), [local AI and projections](05-local-ai-and-projections.md), and [mobile/paywalls](06-paywalls-and-mobile-launch.md).

For the legal ownership distinction behind child-owned assets, see the official [Junior ISA overview](https://www.gov.uk/junior-individual-savings-accounts). Product behaviour treats child-owned money separately irrespective of whether the record is a Junior ISA. No tax allowance is hard-coded by this MVP.
