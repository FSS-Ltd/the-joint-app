# The Joint App — Complete Build Plan

**Prepared for FSS engineering · 22 October 2026 · UK-first product**

**Current phase:** Product definition, researched architecture and implementation planning. No app, live connection, provider approval or hardware benchmark is claimed complete.

## Executive recommendation

Build a useful shared finance web app first, then connected account ingestion, deterministic goal projections and a local AI companion. Reuse the backend in native iPhone/Android apps and add public subscriptions after the founder version is trustworthy.

The default stack is **Next.js + TypeScript, NestJS, PostgreSQL/Prisma, Supabase Auth, AWS London, and Expo for mobile**. Start local AI with **Gemma 4 E4B Q4_K_M through Ollama on the compatible pilot computer**, subject to a real benchmark. The model explains calculations; it does not own financial arithmetic or execute financial actions.

Two release facts deserve early attention:

- Trading 212's documented API is technically useful, but its terms make written permission an explicit prerequisite for the intended custom/shared product. Read 04 before building that adapter.
- Bank production access and commercial minimums need a quote and an agreed regulatory arrangement. Do not assume a free UK production tier.

Manual/CSV support makes the product useful while these dependencies are resolved. It does not count as a successful direct connection.

## 1. Read this pack in order

| File                                                                                 | What it decides                                                                     |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| [01-product-specification.md](01-product-specification.md)                           | Goals, users, required features, household privacy and release definitions          |
| [02-architecture-and-project-structure.md](02-architecture-and-project-structure.md) | Stack, alternatives, trust boundaries, cloud design and explained repository paths  |
| [03-data-model-and-financial-rules.md](03-data-model-and-financial-rules.md)         | Entities, SQL blueprint, exact-money rules and no-double-counting fixtures          |
| [04-account-integrations.md](04-account-integrations.md)                             | Banks, Trading 212, permissions, adapters, sync and real-data acceptance            |
| [05-local-ai-and-projections.md](05-local-ai-and-projections.md)                     | Verified model options, companion protocol, forecasting math and AI evaluations     |
| [06-paywalls-and-mobile-launch.md](06-paywalls-and-mobile-launch.md)                 | Free/Plus boundary, pricing hypothesis, subscriptions and native store rules        |
| [07-api-and-frontend-specification.md](07-api-and-frontend-specification.md)         | REST endpoints, DTOs, errors, routes, forms, mobile and accessibility               |
| [08-security-privacy-and-compliance.md](08-security-privacy-and-compliance.md)       | Authentication, isolation, encryption, retention, household exit and release review |
| [09-delivery-operations-and-costs.md](09-delivery-operations-and-costs.md)           | Effort, budgets, CI/CD, testing, monitoring, backup targets and runbooks            |
| [10-risks-decisions-and-roadmap.md](10-risks-decisions-and-roadmap.md)               | Risks, assumptions, ADRs, open inputs and post-MVP choices                          |
| [11-research-and-verification-register.md](11-research-and-verification-register.md) | Official sources, verified facts and what still requires evidence                   |
| [12-coding-agent-handoff.md](12-coding-agent-handoff.md)                             | Copy-ready starting prompt, invariants and implementation reporting format          |

Each specialist document is a specification; each phase file is a task plan. Read both before implementing that phase.

## 2. Phases to MVP

| Phase plan                                                                        | Deliverable and exit                                                           |     Effort |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------: |
| [00-feasibility-and-access.md](phases/00-feasibility-and-access.md)               | Exact account inventory, provider permissions/cost gates, stack/model baseline |   3–5 days |
| [01-foundation-and-manual-finance.md](phases/01-foundation-and-manual-finance.md) | Two adults, privacy, CSV/manual records, spending, budgets and export          |  8–12 days |
| [02-connected-accounts.md](phases/02-connected-accounts.md)                       | Approved live bank and Trading 212 feeds, reconciliation and safe revocation   | 12–18 days |
| [03-wealth-and-goal-projections.md](phases/03-wealth-and-goal-projections.md)     | Net worth, child assets, allocations, basic forecasts and advanced scenarios   |  8–12 days |
| [04-local-ai-and-founder-mvp.md](phases/04-local-ai-and-founder-mvp.md)           | Paired Mac, supported AI answers and a successful founder monthly review       |  8–13 days |
| [05-mobile-and-public-mvp.md](phases/05-mobile-and-public-mvp.md)                 | Native iOS/Android, purchases/restore, public controls and commercial go/no-go | 13–20 days |

**Engineering total:** 39–60 days through founder MVP; 52–80 days through public mobile MVP. External approvals and a full calendar month of founder observation are additional elapsed-time dependencies; some can overlap safe development.

Every phase includes planned paths, interfaces, checkbox tasks, meaningful test assertions, verification commands and exit/rollback conditions. Commands are future repository scripts, not tests already run on an existing app.

## 3. MVP acceptance boundaries

**Founder MVP requires:** both adults using independent accounts; explicit per-account sharing; accurate spending and balances; approved live bank and Trading 212 data; savings/wealth/children views; reproducible projections; a functioning local assistant; safe export/revocation; and recovery evidence.

If a live feed or local AI remains unavailable, label the release **founder beta with partial connectivity/capability**, naming the missing requirement. Do not rename a mock or CSV import to “connected”.

**Public MVP additionally requires:** native device testing, store/payment lifecycle, permitted commercial integrations, viable costs, documented privacy/perimeter review, security review, accessible screens and operating procedures.

## 4. Proposed paywalls

| Free household                                 | Household Plus — provisional £5.99/month or £59.99/year |
| ---------------------------------------------- | ------------------------------------------------------- |
| Two adults and uncapped manual records         | Same household membership and manual features           |
| CSV imports, categories, spending and budgets  | Supported live bank refresh: up to four authorisations  |
| Manual wealth, investments and child records   | Up to two approved direct broker connections            |
| Goals and basic zero-growth contribution dates | Advanced what-if/return/inflation comparisons           |
| Readable history, exports and privacy controls | Automation and local AI on one compatible companion     |

A bank authorisation is institution × consenting adult, not necessarily an account. Provider charging may use different units. The founder household receives an auditable expiring grant while billing is being built; no client-side bypass.

The tentative price is not a validated commercial offer. Provider quotes and after-fee unit economics can force a change. Downgrade stops new premium work while preserving authorised history and free controls, subject to the normal retention policy.

## 5. Important architecture decisions

Financial information is stored in the cloud so both adults can use the app. AI inference happens on a specifically approved household computer. **This is local inference, not wholly local storage or E2EE.** New AI answers wait when that computer is unavailable; accounts and deterministic projections continue independently.

The two adults grant account visibility separately: NONE, TOTALS or TRANSACTIONS. Account ownership, sharing, billing and approval to disclose evidence to a local device are distinct. Children's assets stay separate from adult spendable money.

Use a London web/API host and a separate small worker host with distinct IAM roles, a private finance schema and scoped database access. Durable jobs stage provider pages before publishing complete updates. No raw banking/trading credentials reach mobile clients or the AI companion.

## 6. Planning costs

- Founder fixed infrastructure: approximately **£60–140/month**.
- About 100 paying households: approximately **£120–350/month**.
- About 1,000 paying households: approximately **£250–800/month**.

These exclude bank/broker contracts, store/payment fees, professional reviews, development time and optional new hardware. They are estimates, not supplier quotes. The detailed economics in 06/09 explain why provider minimums and annual-plan revenue matter.

## 7. Coverage of the CTO output contract

| Requested section                     | Main file(s)              |
| ------------------------------------- | ------------------------- |
| 1. Executive summary                  | 00, 01                    |
| 2. Stack and alternatives             | 02                        |
| 3. Architecture/data flow/trust zones | 02, 05                    |
| 4. Cloud/infrastructure/cost          | 02, 09                    |
| 5. Security/compliance                | 08, 04, 06                |
| 6. Data model/schema                  | 03                        |
| 7. API contracts/errors               | 07, 04, 05                |
| 8. Frontend/mobile                    | 07, phase 05              |
| 9. Backend/modules/jobs               | 02, 04                    |
| 10. Explained folders                 | 02                        |
| 11. DevEx/CI/CD                       | 09                        |
| 12. Testing                           | 03, 05, 09 and each phase |
| 13. Observability/runbooks            | 09                        |
| 14. Milestones/tasks/acceptance       | Six phase files           |
| 15. Risks/mitigations                 | 10                        |
| 16. Post-MVP roadmap                  | 10                        |

## 8. Document authority and change control

01 owns product intent; 03 owns financial conventions/entities; 07 owns public application routes/DTOs; 04 owns provider-specific documented behaviour and approval gates; 05 owns projection and AI protocols; 06 owns commercial entitlements. A phase cannot override them silently. Resolve a conflict with a dated ADR and update the affected files.

The checked external facts have source links and a research date. Prices, supported accounts, terms, model builds and store policies can change. The code agent must verify them again at the relevant implementation/release gate.

Copy this complete folder into `docs/joint-app/` in the implementation repository, keeping relative links intact. Start with the handoff and Phase 0; do not feed a coding agent one isolated phase while withholding the financial, permission and integration specifications it depends on.
