# The Joint App — Risks, Decisions and Post-MVP Roadmap

## 1. Highest-priority risks

| Risk                                                    | Why it matters                                                                            | Concrete mitigation and release gate                                                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Trading 212 permission is unavailable                   | A technical API exists but intended custom/shared use is contractually constrained        | Obtain written permission before provider-specific implementation; keep generic manual/CSV tracking useful; do not market a blocked connector |
| Bank access is too expensive or unsuitable              | UK commercial minimums may overwhelm an early consumer subscription                       | Cost actual two-adult usage, obtain production/regulatory acceptance and test one real supported account before selecting provider            |
| Financial totals look precise but are wrong             | Transfers, card payments, duplicate accounts and holdings can inflate spending/wealth     | Canonical identity, exact arithmetic, source provenance, reconciliation and golden fixtures                                                   |
| Partner privacy leakage                                 | Household membership can accidentally become broad financial surveillance                 | Private defaults, explicit per-account grants, separate device approval and derived-result invalidation                                       |
| Local AI needs an available computer                    | New phone answers stop when the Mac sleeps; most consumers may not have a suitable device | Keep core tracking/calculations independent, make companion optional, validate demand before pricing AI as the main benefit                   |
| AI makes unsupported claims                             | A convincing explanation can misstate costs, dates or investment implications             | Deterministic engine, constrained tool intents, evidence-linked rendering, adversarial evaluation and no autonomous financial actions         |
| A successful pilot is mistaken for regulatory readiness | Couple-only use and public paid use have different contractual contexts                   | Explicit provider/perimeter/privacy gates, actual approval evidence, recheck at public launch                                                 |
| Store billing or restore moves access incorrectly       | Two adults and multiple purchase platforms complicate ownership                           | Immutable household binding, original billing identity, idempotent reduction, conflict handling and full lifecycle tests                      |
| A backup restores deleted private data                  | Recovery can undo privacy decisions or reuse revoked keys                                 | External deletion/revocation ledger, isolated restore, replay before traffic or jobs                                                          |
| Low annual price loses money                            | Provider fees and fixed overhead remain while annual revenue is spread across months      | Treat price as hypothesis; margin gate with actual fees, free-user cost and annual-plan mix                                                   |
| Excessive MVP scope                                     | Simultaneous banks, brokers, local models and native stores can consume months            | One bank provider, one permission-gated broker, one household, one local runtime; six gated phases                                            |
| Provider/schema changes                                 | Beta APIs and live policies can change                                                    | Adapter contracts, versioned fixtures, canary sync, feature kill switches and source review                                                   |

## 2. Decision register

| ID      | Decision                                | Reason                                                | Revisit trigger                                   |
| ------- | --------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| ADR-001 | PWA before Expo                         | Useful couple workflow earlier                        | Public mobile phase                               |
| ADR-002 | Next + Nest + Postgres modular monolith | Matches team skills and separates financial authority | Measured service/queue scaling need               |
| ADR-003 | London primary application/data         | UK starting market and residency preference           | Contract requiring EU-only location               |
| ADR-004 | Cloud operational data, local inference | Couple access with private model execution            | Strict local-only customer segment                |
| ADR-005 | NONE/TOTALS/TRANSACTIONS per account    | Equal adult agency and explicit disclosure            | Additional roles/households                       |
| ADR-006 | Parent-only child profiles              | Minimal identity and simpler safeguarding boundary    | A separately designed teen product                |
| ADR-007 | Deterministic projection engine         | Reproducible money calculations                       | Dated-event/stochastic modelling requirements     |
| ADR-008 | Postgres job queue                      | Fewer services at small scale                         | Queue contention/throughput targets missed        |
| ADR-009 | Free + one Plus household plan          | Simple pricing and healthy collaboration              | Evidence of distinct customer needs               |
| ADR-010 | No payments/trades                      | Focus and reduced financial-action risk               | Separate authorised product scope                 |
| ADR-011 | No persistent offline finance cache     | Easier revocation/reconciliation                      | Verified customer need and a separate sync design |
| ADR-012 | HALF_UP minor-unit rounding             | One explicit engine/report convention                 | Versioned engine change with compatibility tests  |

A change record includes decision owner, date, options, evidence, implementation effect, migration/test effect and source updates. Do not silently change prices, privacy semantics or integration promises while following a phase checklist.

## 3. Open decisions to resolve before real implementation

| Question                                                     | Default while unresolved                                      | Owner/action                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Which banks and exact account types do the couple use?       | No assumed coverage                                           | Founders supply names/product types, never credentials in documentation |
| Which Trading 212 account(s), currency and intended sharing? | Invest/Stocks ISA candidate only; permission not yet obtained | Founder/provider response and approved live capability test             |
| Which children's account providers and ownership structures? | Manual, dated child-owned records                             | Founder inventory and account authority verification                    |
| Is the compatible pilot computer reliably available?         | On-demand local AI only                                       | Phase 0/4 benchmark and usability test                                  |
| What monthly provider spend is acceptable?                   | Do not sign a minimum or promise Plus price                   | Founder budget plus real quotes                                         |
| Which legal entity will operate the public app?              | No assumed registration/regulated status                      | Resolve before contracts and store enrollment                           |
| Is “The Joint App” available as a public brand/domain?       | Working title                                                 | Appropriate name/domain/trademark review before promotion               |

These questions do not prevent delivering this plan. They are implementation inputs with explicit defaults and gates.

## 4. Near-term roadmap after public MVP

### First 30–60 days

Improve recurring-cost detection from real corrections, add a monthly review export, improve accessibility and shorten first-connection onboarding. Measure reports that users actually revisit, connection failure reasons and support volume. Keep analytics free of balances, merchants and relationship-sensitive behaviour.

Track activation as: both adults accepted, at least one authorised account has usable data, a budget/goal was reviewed. Track retention by household-level product use without analysing private spending for marketing. Record completion locally/server-side with coarse events and appropriate privacy choices.

### Next integrations

Prioritise providers requested by paying households after confirming commercial rights and actual account coverage. Candidate categories include additional UK savings accounts, pensions and other brokerages. Each gets its own contract/capability/ownership fixture and a sustainable price model. A directory listing is not an integration guarantee.

A provider-independent import mapping library can improve coverage faster than promising unsupported APIs. Receipt OCR, document parsing and tax-year summaries remain separately scoped because of added data and accuracy risks.

### Better forecasting

Introduce dated-event cash-flow scheduling for irregular bills/contributions, explicit salary changes and holiday/sinking-fund plans. Add historical benchmark comparisons only with licensed data and well-defined caveats. Monte Carlo or probabilistic projections require independently reviewed methodology, transparent assumptions and calibrated uncertainty; they are not an automatic extension of a fixed-growth line chart.

### Wider local AI support

Benchmark selected iPhone/Android devices for on-device inference with downloadable model packages, memory/thermal/battery measurement and supported-device gating. Keep a deterministic fallback on every supported phone. Consider a signed Windows/Linux companion before introducing cloud inference.

A hosted AI option, if later useful, must be optional, clearly priced and separately consented, with data processing/residency and store-disclosure review. It is not an automatic fallback for an asleep Mac.

### Operational scale

Add independent web/API replicas, managed queues, database PITR/compute upgrades and additional operator coverage based on measured needs. Maintain UK/EU deployment boundaries if entering new markets. Do not create a region selector that promises data isolation without actual separate storage, jobs, keys, backups and support controls.

## 5. Commercial expansion boundaries

Possible later features include broader household membership, advisers with explicit delegated access, white-label partnerships and employer benefits. Each introduces new permission, billing and regulatory questions. Avoid selling transaction data, ad targeting based on financial distress or making private account access contingent on the payer's permission.

The objective remains a useful shared money tool whose source numbers, ownership and assumptions are understandable.
