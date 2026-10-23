# Task 0.5 — Release scope and delivery order

Date: 23 October 2026. This is the CSV-first release baseline, not an implementation-completion report. Read [canonical intent](../joint-app/01-product-specification.md), [launch gates](launch-gates.md) and [cost model](cost-model.md).

## Releases

- Manual foundation, Phase 1: two adult identities, private-by-default accounts, robust CSV/manual records, spending, budgets, export/revocation/deletion and recovery evidence. This is useful software; it does not include completed wealth/projection, local-AI or native features.
- CSV-first founder MVP: Phase 1 plus manual wealth/goals/deterministic projections in Phase 3 and the tested, permission-aware companion/monthly review in Phase 4. No bank/broker API feed or child-profile feature is required. Never label CSV uploads connected accounts. If local AI is unavailable, explicitly label the release's missing capability rather than pretending the full founder acceptance passed.
- CSV-first public mobile MVP: add Phase 5 native-device/security/store, implemented subscription lifecycle and actual commercial go/no-go evidence. Sell/advertise only delivered capabilities. Free manual tracking, collaboration and privacy controls remain free; live-refresh benefits are not on sale.
- Post-MVP: Phase 2 direct bank work and any separately approved broker API work, after source permissions/procurement and the ordinary code/release gates. Child profiles/child-specific screens are a separately planned post-MVP addition. No implicit authorisation to trade or move money.

## Dependency graph

Preserve all six phase IDs for traceability. Current execution path: Phase 0 baseline → Phase 1 → Phase 3 using manual/imported evidence → Phase 4 → Phase 5. Phase 2 is deferred post-MVP; its absence is not a blocker to manual wealth/projections. Child-specific tasks in Phases 3/5 are deferred. Paid billing and public launch still wait for security/privacy, device and cost gates; source rights are required for any source actually used.

The FSS delivery gate remains unchanged: each numbered/standalone unit gets a branch and PR; verify its predecessor's actual merged state, run local checks and self-review before raising the PR, require current-head/test-merge/queue CI and required reviews, merge within standing user authority, verify host merge and record evidence before advancing. Never work on the next unit while a current unit is unmerged.

External approvals can remain held when not required by current scope. Do not relabel missing supplier evidence approved, or use a CSV parser to implement an unauthorised API client. No current step authorises supplier messages, contracts, cloud spend or production deployment.

## Phase 0 handoff coverage

| Requirement             | Disposition / evidence needed                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| R01 identity/household  | Task 1.2 must prove two adult identities, invitation, revocation; baseline is not implementation.                                |
| R02 direct banks        | Post-MVP; B1–B3 stay missing before future activation.                                                                           |
| R03 investments         | Generic owner-uploaded/manual records; T1/T2 gate any future provider-specific API work. No universal non-crypto coverage claim. |
| R04 imports             | Preview/mapping, exact money/date handling, validation/reject reasons, deduplication, provenance and rollback in Task 1.4.       |
| R05 spending            | Booked-period, authorised scope and transfer/card exclusions in Task 1.5.                                                        |
| R06 budgets             | Calendar-month budgets, incomplete-history labels and accessible feedback in Task 1.5.                                           |
| R07 net worth           | Manual/imported source-as-of values; no double counting; exclude verified child-earmarked funds from adult spendable money.      |
| R08 goals               | Manual funding and allocation limits in Phase 3; no executed transfers.                                                          |
| R09 projections         | Code-owned exact arithmetic and independent golden answers, Phase 3.                                                             |
| R10 children            | Profiles/UI/projections post-MVP; current safety exclusions remain.                                                              |
| R11 local assistant     | Digest-pinned smoke only so far; full Phase 4 evaluation, pairing/consent/offline and revocation still required.                 |
| R12 shared review       | Only mutually authorised records/notes, Phase 1/4.                                                                               |
| R13 monetisation        | Server capabilities and tested downgrade; public charging waits for implemented benefits and commercial gate.                    |
| R14 mobile              | Mobile-first web now; actual Expo apps and physical-device/security/store gates remain Phase 5.                                  |
| R15 portability/privacy | Export, leave/delete and owner-safe archive access, Task 1.6.                                                                    |
| R16 reliability         | Durable jobs, idempotency and real recovery tests; provider-sync portions wait for the provider phase.                           |

## Immediate next delivery

After Task 0.5 is locally checked, current CI passes and merge is verified, Phase 1 Task 1.1 is next. Reuse B0 rather than rescaffolding: add the planned schema/seed, durable job/outbox mechanics, real readiness and harmless authenticated vertical slice with meaningful isolation/retry/recovery tests. Auth, source and design decisions remain as recorded in [architecture baseline](architecture-baseline.md) and [mobile-first direction](design-direction.md).
