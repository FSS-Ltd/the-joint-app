# FSS build guide

Version: 3.0 | Updated: 2026-10-05 | Owner: Jean-Fidele Ntagengwa

Read for implementation, debugging, review, infrastructure and releases.
[AGENTS.md](AGENTS.md) contains the mandatory build-step PR/CI/merge gate and
shared authority rules. This guide explains how to satisfy them.

## Start with evidence and a bounded step

1. Inspect the working tree, active branch, remote and repository instructions.
   Preserve unrelated user work; reuse a suitable active worktree when available.
2. Identify the current step and its acceptance criteria from the existing plan.
   Check the preceding step's PR and merge evidence before changing code.
3. Read the relevant implementation, tests and configuration. Derive executable
   commands from package scripts, CI workflows, README or build tooling; do not
   assume that this reusable rule set knows a repository's commands.
4. For a small fix, state a short plan and reproduction/verification criteria.
   For multi-step features, major architecture or data changes, maintain a design
   and delivery plan in the repository's existing documentation location.
5. Identify material ambiguity, sensitive data, migrations and release risks.
   Resolve blocking decisions; proceed with documented routine assumptions.

Design records should cover the problem, goals and scope, users, boundaries,
data model, security, failure modes, trade-offs, acceptance criteria, rollout and
recovery. Scale detail to the task; a typo fix does not need an architecture doc.

## Deliver one step through its PR

Use this sequence for every build step, including standalone implementation work:

1. **Implement:** branch from the verified merged base for this step. Use a clear
   name such as `build/1.1-auth-foundation`; keep the diff limited to this step.
2. **Verify locally:** run the applicable repository checks and inspect the
   behavior. Add meaningful regression or feature tests, then self-review every
   changed file and the diff. Record unavailable checks honestly.
3. **Raise the PR:** commit only the intended changes, push and open a PR against
   the designated base. Use the step ID in the title and link the plan or issue.
   Prefer a ready-for-review PR after successful local verification. If verification
   is blocked, publish a draft with the blocker where possible. Attach the PR to
   the current task when the tool supports it. Never report a fabricated PR URL.
4. **Resolve CI and review:** inspect results for the latest pushed revision;
   fix failures and requested changes within this same step. After every push,
   recheck CI. Do not remove tests, weaken check commands or change branch rules
   just to obtain a green result. Explain pre-existing failures without ignoring them.
5. **Merge and verify:** satisfy required checks, reviews and conversations.
   Merge only when already authorized; otherwise leave the concrete PR ready for
   the authorized reviewer. Verify actual merged state, base branch and merge
   commit from the repository host. A closed but unmerged PR does not qualify.
6. **Record and advance:** update the existing progress record with evidence,
   fetch the merged base and use it for the next authorized step. Preserve local
   work when updating branches. Never begin the next step before the gate passes.

Read-only host queries through GitHub tools or a configured CLI can establish
PR state, head revision, check conclusions, review decisions and merge commit.
Inspect the checks for the revision GitHub actually requires, including a test
merge commit or merge-group commit when applicable. Never infer success from a
command's exit code without reading the returned state.

If access, CI setup, required review or merge is unavailable, state precisely
what is missing and what action would unblock it. Remain on the current step.
Waiting for CI permits fixes, review and documentation for that step, not work
on `1.2` while `1.1` is unmerged. Delegated agents follow the same boundary.

### Progress record

Use the existing tracker. When none exists, create a concise repository-local
record for multi-step delivery with these fields:

| Field               | Evidence                                                     |
| ------------------- | ------------------------------------------------------------ |
| Step and scope      | Stable ID, intended behavior and acceptance criteria         |
| State               | Planned, implementing, PR open, CI green, merged, or blocked |
| PR                  | Actual URL and designated base branch                        |
| Checked revision    | Latest PR head SHA and relevant test-merge/queue SHA         |
| Verification        | Commands/results and live CI check names/conclusions         |
| Review              | Required review/conversation status                          |
| Merge               | Host-reported merged state and merge commit SHA              |
| Blocker/next action | Exact issue and next permitted action                        |

Only the merged state is complete. Store durable evidence; revalidate live
status when resuming rather than trusting a stale table.

### PR description

Describe the problem and resulting behavior first. Include step ID, scope,
acceptance evidence, checks run/results, checks unavailable, migration/config
impact, rollback/recovery and material limitations. Link design/issue context.
Keep PRs focused and reviewable; split large work into planned sequential steps
rather than enforcing an arbitrary line-count quota.

## Repository enforcement

Rule files guide agents; configure the host to enforce merge policy too. Inspect
existing rules first. Propose missing protections and apply them when authorized:

- Protect the delivery base with active rulesets or branch protection requiring
  PRs, named required CI checks, configured review approvals and resolved review
  conversations. Require code-owner review for sensitive paths when configured.
- Disallow force pushes and deletion; avoid agent/admin bypass paths. An agent's
  self-review never substitutes for a required independent approval.
- Ensure CI covers the current revision and integration with the base through
  strict/up-to-date checks or a merge queue, according to repository policy.
- Give check jobs distinct, stable names. Avoid required workflows that never
  run because of path/branch filters. An aggregate gate must run even when a
  prerequisite fails and explicitly fail if an applicable prerequisite did not
  succeed. Do not let `continue-on-error` conceal a blocking failure.
- If a merge queue is used, trigger required workflows for `merge_group` as well
  as the repository's existing PR event configuration.
- Treat skipped/neutral conclusions carefully: the host may accept them, but
  the FSS gate requires actual success for applicable checks. Document why any
  check is not applicable; keep an always-running required gate where needed.

Host protection prevents invalid merges. It does not prevent an agent from
starting the next step early; that sequence remains mandatory in AGENTS.md and
must be checked in the progress record before implementation/delegation.

## Architecture and stack

- Preserve the established stack. For a new UK B2B SaaS, default to strict
  TypeScript, Next.js/React, managed PostgreSQL and Prisma. Use small Next.js
  route handlers for a simple MVP or NestJS for substantial backend domains.
  Consider ASP.NET Core/EF Core when .NET or Microsoft integration is the better fit.
- Prefer a modular monolith with explicit domain boundaries. Add Redis, queues,
  microservices or orchestration only for demonstrated requirements.
- Choose managed hosting, authentication and storage after verifying required
  regions, security, integration, budget and operational ownership. Prefer UK/EU
  residency; London where suitable. No universal vendor default overrides this.
- Use a monorepo only when shared code and coordinated delivery justify it.
  Typical boundaries: `apps/` deployables, `packages/` shared code, `infra/`
  infrastructure, `scripts/` tooling and `.github/` delivery configuration.
- Keep components/services focused, data passed explicitly and business logic
  outside routes/controllers. Use precise DTOs/schemas and existing conventions.
- Record significant boundary or vendor choices in an ADR. Do not create
  interfaces, repositories or configuration layers without a concrete need.

## Implementation and testing

- Use semantic HTML, labels, keyboard access and appropriate focus behavior.
  Verify responsive layouts and relevant form validation/pending/error feedback.
- Validate at trust boundaries and represent domain errors explicitly. User-facing
  errors should be useful without exposing internal systems or sensitive data.
- Use parameterized queries, tenant-scoped access and justified indexes. Check
  pagination, connection pooling and N+1 behavior on affected data paths.
- For bugs, reproduce the failure and add a regression test when meaningful.
  For features, test behavior, permissions and failure paths. Use integration
  tests for database/service boundaries and E2E tests for affected critical flows.
- Prefer real behavior and deterministic fixtures over implementation-mirroring
  assertions. Do not add tests for a prose-only edit simply to create test counts.
- Use existing coverage thresholds and test tooling. Improve coverage of material
  risk; a generic percentage is not proof of correctness. Do not weaken existing
  thresholds or introduce unexplained skips.
- Run relevant formatting, lint, type, unit/integration/E2E and build checks as
  applicable. Broaden verification when risk or failures justify it; do not keep
  rerunning an unchanged passing suite without a reason.
- Set performance budgets against real user journeys and expected traffic.
  Measure affected hot paths and validate caching/invalidation when changed.

## Security, data and delivery

- Enforce server-side authentication and authorization on protected operations,
  including object/tenant access. Preserve audit trails for sensitive actions.
- Protect secrets in approved stores, limit CI token permissions and use trusted
  dependency/workflow sources. Scan affected dependencies with existing tooling.
  Treat PR titles, branch names and other untrusted CI input as data, not shell code.
- Document data ownership, retention, deletion and export requirements. Minimize
  sensitive test data and logging; encrypt transport and storage as required.
- For schema changes, explain impact, use additive/expand-contract rollout when
  appropriate, test migration/backfill behavior and plan recovery. Do not promise
  a reversible down migration for destructive data changes; use verified backups
  or forward fixes where rollback cannot restore data.
- For releases, verify artifact provenance, environment/configuration, migrations,
  health checks, observability and rollback/recovery. Use feature flags only where
  they reduce a real rollout risk. Deploy to production within explicit authorization.
- Maintain actionable logs, metrics and request correlation proportional to the
  service. Define alerts, ownership, runbooks and backup/restore exercises for
  relevant failure modes. Do not expose personal data or secrets in telemetry.
- Explain RPO/RTO and validate restore plans for persistent production data.
  Merging and releasing are separate events, even where automation connects them.

## Closure and worktree cleanup

Keep setup instructions, API/config changes and important decisions current.
Report shipped behavior, verification, PR/gate state and remaining limitations.
Avoid promises about onboarding speed or recovery time without evidence.

Clean temporary worktrees only after verifying the work is merged or safely
preserved, and checking uncommitted, untracked and ignored user data. Preserve
active worktrees and the current checkout. Use the tool that manages the worktree
or `git worktree remove`; never force-remove to bypass safety checks.
