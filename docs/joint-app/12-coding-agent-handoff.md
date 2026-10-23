# The Joint App — Coding Agent Handoff

> **Current execution order, 23 October 2026:** The CSV-first baseline follows Phase 0 → Phase 1 → Phase 3 from manual/imported evidence → Phase 4 → Phase 5. Phase 2 bank/direct-source work and child profiles are deferred; live-source prerequisites below do not block the manual MVP. Retain source activation gates, local-AI/security/device requirements and the per-step PR/CI/merge gate. See [release scope](../decisions/release-scope.md).

Use this document when handing the plan to Codex, Claude Code or another implementation agent. The deliverable in this folder is documentation; it does not imply an existing application or authorised external deployment.

## 1. Suggested starting instruction

```text
You are implementing The Joint App from the supplied Markdown plan.

Read 00-README.md, 01-product-specification.md,
02-architecture-and-project-structure.md,
03-data-model-and-financial-rules.md,
07-api-and-frontend-specification.md,
08-security-privacy-and-compliance.md, and the current phase file.

Start with Phase 0. Inspect the actual repository and existing instructions.
If there is no repository yet, establish the proposed monorepo only when the
current phase authorizes implementation. Preserve this plan in docs/joint-app/.

Implement one reviewable task at a time. Record planned files, interfaces,
acceptance tests and result evidence. Run meaningful tests for financial
rules, permissions, provider ingestion and billing. Keep documentation aligned
with implementation, and do not claim a phase complete with unresolved gates.

Use synthetic data until real-data controls and provider permissions pass.
Trading 212-specific implementation for this intended shared app is blocked
until the documented written permission exists. Generic contracts, manual
tracking, synthetic adapters and other independent work can continue.

Do not invent provider coverage, credentials, a price quote, hardware benchmark,
legal clearance or app-store approval. Do not initiate trades or payments.
Keep financial calculations deterministic and AI tools read-only.

When a prerequisite is missing, identify the exact requirement and evidence
needed, mark that task blocked, and complete independent authorized work.
Report what changed, the tests actually run, and remaining risks.
```

Optional project skills can improve review and task execution, but the plan does not require the user to install a particular agent plugin. Follow the actual repository's instructions and the user's authorisation.

## 2. Dependency order

Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 is the normal path. Approved provider procurement runs alongside foundation work. With fixtures, Phase 3 can progress while a real connector is blocked; the full founder acceptance gate still requires the missing real feed. Mobile layout work can begin once contracts stabilize; billing and release wait for the earlier security/data gates.

Do not implement all phases in one unreviewable change. Keep pure calculation work, ingestion work, local-device work and billing work in separately testable tasks.

## 3. Rules that must survive summarisation

1. One household, two adult logins; private-by-default accounts.
2. Account grants: NONE, TOTALS, TRANSACTIONS; billing admin is not a data superuser.
3. Parent-managed child assets stay separate from adult spendable wealth.
4. Exact cash minor units, decimal holdings/rates and HALF_UP at named boundaries.
5. Canonical account identity prevents duplicate joint accounts.
6. Transfers, card repayments and investment deposits do not inflate consumption/returns.
7. Bank and broker APIs are read-only, permission-gated and capability-specific.
8. Calculations run in code; AI explains authorised evidence, without SQL or money movement.
9. Cloud operational storage plus local inference is not E2EE or fully local storage.
10. The Mac must be available for new AI answers; no automatic cloud fallback.
11. Free basic tracking/projection/privacy/export; Plus automation/sync/advanced scenarios/AI.
12. Server and worker enforce entitlements; stored source permissions also apply to old results.
13. No financial payloads in logs, analytics, push notifications, shared caches or previews.
14. Saved data survives downgrade subject to the normal retention and privacy policy.
15. Production/live success needs actual evidence; simulations remain labelled simulations.

## 4. Required task record

```markdown
### Task ID and title

- Phase/spec references:
- Prerequisites and external gates:
- Files added/changed:
- Interfaces consumed/produced:
- Tests and assertions:
- Commands actually run:
- Observed results:
- Migration/recovery effect:
- Known limitations:
- Status: not started / in progress / blocked / verified
```

Keep `docs/decisions/provider-gates.md` and the version matrix current. A gate record has status, owner, evidence reference, expiry/recheck date and downstream tasks. Status “unknown” is not “approved”.

## 5. Repository bootstrap contract

Create the package names and scripts described in the operations specification. At minimum define root `lint`, `typecheck`, `test`, `build` and `format:check`; package tests include meaningful domain, integration and E2E entry points.

Phase files name planned paths. If a repository already has a compatible structure, map those names explicitly instead of moving everything without cause. Never use a placeholder route or fake provider response as evidence of a real connection.

Document how to run synthetic local web/API/worker/database services, seed two unrelated households, execute the permission matrix and reproduce the goal golden case. The local companion is optional until Phase 4.

## 6. Completion report

At a phase handoff, provide a compact report with working flows, verified assertions, unresolved gates, costs incurred or still unknown, and the next dependency. Do not report deployment, external approval, test success or code existence merely because it was described in this plan.

The final public-MVP release report includes provider approvals, real-device flows, actual store/billing validation, restore evidence, privacy/deletion evidence and the commercial go/no-go calculation.
