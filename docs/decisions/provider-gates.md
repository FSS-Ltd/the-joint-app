# Provider evidence gates

Task 0.2 bank register and Task 0.3 brokerage boundary. Checked 23 October 2026. Public evidence references are research, not approval. Owner “founder” means the human operator; engineering owns technical verification after approval. Store supplier contracts/quotes and private product matrices through a private channel, never in this public repo.

| id  | status  | owner                                   | evidenceRef                                                                              | checkedAt  | recheckAt                            | permittedScope                                                        | blockedTasks                                                             |
| --- | ------- | --------------------------------------- | ---------------------------------------------------------------------------------------- | ---------- | ------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| B1  | missing | Founder / supplier                      | bank-provider-comparison.md; no written production acceptance or product matrix supplied | 2026-10-23 | 2026-11-06 or earlier supplier reply | Public research and synthetic development only; no real source access | Bank adapter selection, real consent/data runs, connected release claims |
| B2  | missing | Founder / supplier / qualified reviewer | FCA source in comparison; no app-specific approved AIS model                             | 2026-10-23 | 2026-11-06 or earlier supplier reply | Review only; no self-declared regulatory role                         | Live household/public AIS activation                                     |
| B3  | missing | Founder / supplier                      | No quote supplied; public docs do not establish app-specific charges                     | 2026-10-23 | 2026-11-06 or earlier supplier reply | Cost questions and scenario preparation only; no spend commitment     | Provider procurement, paid-plan viability and commercial go-live claims  |

## Evidence required

- B1: supplier acceptance naming intended two-adult use, legal contracting entity, exact products/data/history, production eligibility and any downstream-display restrictions. Credentials stay in secret storage and are never the evidence document itself.
- B2: supplier-approved assignment of AIS principal/agent/TSP responsibilities, consumer terms/consent and any registration/qualified review needed. A provider's own licence does not establish the app's role.
- B3: dated quote with validity, setup/minimums, charging units, 2-adult and 100/1,000-household scenarios, taxes, term, refresh/reconnect and exit costs. Founder explicitly accepts the budget before committing spend.

## State changes

Use missing, under-review, approved, rejected or expired. Only mark approved when the evidence explicitly covers this app's scope; record the non-secret evidence reference, reviewer and validity/recheck date. If a condition changes or expires, re-open the affected gate and block the corresponding live activity. No automatic renewal or outreach is scheduled by this document.

Brokerage permissions belong to Task 0.3; they remain unresolved under the existing integration specification. This step does not implement or approve a broker adapter.

## CSV-first MVP disposition — 23 October 2026

The founder explicitly deferred direct bank connections until post-MVP. B1–B3 remain missing and must not be marked approved. Their downstream block applies to future live bank work, not to the CSV/manual MVP. Recheck when post-MVP bank work is scheduled or supplier conditions change; the table's earlier reminder dates do not schedule procurement or automation.

Task 0.2's current deliverable is the recorded deferral, retained comparison/brief and explicit future gate. This replaces its previous requirement to obtain supplier evidence before manual development may proceed. No enquiry is sent and no production provider is selected. After this revision passes CI and is confirmed merged, proceed to the next planned step. Other source permissions remain governed by their own gates.

## Brokerage gates — Task 0.3

| id  | status  | owner                                | evidenceRef                                                                        | checkedAt  | recheckAt                                    | permittedScope                                                                               | blockedTasks                                                                          |
| --- | ------- | ------------------------------------ | ---------------------------------------------------------------------------------- | ---------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| T1  | missing | Founder / provider                   | trading212-scope.md; no written app-specific API permission supplied               | 2026-10-23 | Before any provider-specific API development | Generic CSV/manual records and synthetic fixtures only, subject to ordinary data permissions | Provider-specific API implementation, credential handling and live/shared API display |
| T2  | missing | Founder / source owner / engineering | Private source inventory; exact wrapper/entity and API reconciliation not verified | 2026-10-23 | Before approved direct-broker testing        | Source discovery; no live test implied                                                       | Direct-broker scope verification, live reconciliation and connected-source claims     |

T1 evidence must cover intended shared/other-user/commercial scope and relevant display/hosting/retention restrictions. T2 requires an actual supported account and permitted read-only scopes after T1 approval; keep credentials out of this register. Both gates remain missing. Task 0.3's CSV-first boundary permits generic manual development, not a provider-specific API bypass.
