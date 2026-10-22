# Bank provider evidence gates

Task 0.2 register. Checked 23 October 2026. Public evidence references are research, not approval. Owner “founder” means the human operator; engineering owns technical verification after approval. Store supplier contracts/quotes and private product matrices through a private channel, never in this public repo.

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

## Current delivery constraint

No gate is approved. Task 0.2 research/brief preparation can be reviewed, but its supplier-dependent acceptance remains incomplete. Under AGENTS.md, a draft PR with green code CI is not a completed/merged build step and does not permit beginning Task 0.3 or later implementation while procurement evidence is absent.
