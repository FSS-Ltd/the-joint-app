# FSS Strategy Rules

Version: 3.0 | Updated: 2026-10-05 | Owner: Jean-Fidele Ntagengwa

**Scope**: Discovery, proposals, commercial analysis, product opportunities and FSS writing.

Read [AGENTS.md](AGENTS.md) first. Load this manual for strategic work. Use
[BUILD.md](BUILD.md) for technical execution. Both roles can be performed by
Claude or Codex; a role change does not require a separate agent or chat.

## Working principles

- Start with the operational problem, its cost, affected users and measurable
  success. Validate the stated solution before designing it.
- State assumptions, sources, alternatives, trade-offs and unresolved decisions.
  Distinguish facts from estimates and targets from guarantees.
- Protect FSS's values: trustworthy, premium, faith-rooted, modern and strategic.
  Flag work that compromises reputation, quality or commercial sustainability.
- Provide clear exit options where appropriate. Client-specific examples, such
  as a credited discovery fee or founding partnership, do not become default
  terms without agreement.
- Consult technical evidence when feasibility, security, migration or effort
  affects the recommendation. Do not force a role handoff for routine decisions
  already covered by the approved scope.
- Prepare recommendations and drafts within the user's authorised scope.
  Obtain human approval before sending proposals or committing FSS to commercial
  terms unless the user has already explicitly authorised that action. Internal
  quality review does not grant authority to contact clients.

## Discovery and client fit

Use light intake before full discovery when fit is unclear. Ideal clients have
£250k+ annual revenue or budget, operational complexity that software can solve,
a decision-maker, and respect for FSS's values and capacity. Discovery is paid
work, normally £2k–£5k; set expectations before starting. Typical discovery takes
2–4 hours across 1–2 sessions, adjusted for complexity.

Cover all five areas; adapt depth to the engagement:

| Area                     | Establish                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organisation and context | Sector, team, users served, growth stage, technical maturity, decision-makers and actual budget.                                                            |
| Operational problem      | What fails, workarounds, weekly effort, business cost, previous attempts and measurable success. Push beyond vague requests such as “better communication”. |
| Current systems and data | Tools, users of each tool, data locations, integrations, manual transfers, migration needs, critical data and legacy constraints.                           |
| Users and stakeholders   | Roles, headcount, technical confidence, system owner, approvers, permissions and compliance workflows.                                                      |
| Constraints and success  | Timeline, budget, testing and migration capacity, training needs, hard constraints and 30/90/180-day outcomes.                                              |

For spreadsheets, establish who maintains them and what happens when they fail.
For legacy systems, establish code access, ownership and replacement constraints.
Flag deadlines that cannot accommodate the scope and clients without capacity
to test, migrate or adopt the system.

Proceed when the problem is real and clear, the client fits, the solution is
within FSS capability, delivery is credible and margin is defensible. The implied
hourly rate must be at least £150, with an explicit risk buffer.

Recommend declining, reducing scope or partnering when the problem is vague,
pricing expectations are incompatible, the timeline cannot flex, adoption is
unlikely, or reputation and margin are at risk. An engagement above £75k that is
better served by a larger agency is a decline or partnership candidate; the
£75k+ platform pricing anchor does not establish delivery capacity. Draft a clear
reason and suitable referral where possible; leave the commercial decision to
the authorised owner.

### Discovery output

Maintain one repository-local discovery document, or the project location the
user specifies. Use Markdown unless another format is requested. Include:

1. Problem statement: specific operational pain and measurable impact.
2. Solution scope: phased deliverables and explicit exclusions.
3. Architecture recommendation: approach, rationale, risks and dependencies.
4. Users and permissions: roles, access and approvals.
5. Integrations and data: systems, migration, ownership and privacy constraints.
6. Phases and milestones: deliverables, effort ranges and acceptance criteria.
7. Effort and pricing: hours, pricing tier, assumptions, buffer and margin.
8. Product opportunity: recurring pain and related independent observations.
9. Risks and mitigations: delivery, adoption, security and commercial exposure.
10. Next steps: proposal, decision, discovery terms or decline recommendation.

## Proposals and build plans

Write proposals from the discovery evidence, typically 2–5 pages. Use this order:
client/FSS/date, operational problem, relevant context if useful, solution,
delivery model, commercial terms, why FSS fits, and decision/next steps.

Commercial terms must state fees, payment schedule, inclusions, exclusions,
assumptions, timeline, change control and exit options. Explain the price plainly;
do not bury it or promise unvalidated features and deadlines. Revise proposals
that lack defensible scope, sustainable margin, capacity, clear next steps or
FSS voice. Complete internal review before seeking any outstanding approval to
send or commit terms.

Technical build plans must:

- Give each build step a unique ordered ID, for example `1.1`, `1.2`, `1.3`.
- Specify scope, dependencies, acceptance criteria and verification for each.
- Define a reviewable PR boundary for each step and account for CI and review
  time in delivery estimates.
- Apply the mandatory progression gate in [AGENTS.md](AGENTS.md) and the
  procedure in [BUILD.md](BUILD.md): raise the current step's PR, obtain green CI
  and confirm it is merged before beginning the next step. `1.2` cannot begin
  while `1.1` is awaiting its PR, checks or merge.
- Record PR, CI and merge evidence in project state. Never promise a sequence
  that requires bypassing the gate, review requirements or merge authority.

Use BUILD.md's design guidance and AGENTS.md's handoff requirements. Material changes
to the approved problem, scope or architecture require a documented decision.

## Commercial policy

These are FSS pricing anchors, not automatic quotes. Adapt within the engagement
and the user's authority; flag departures rather than silently changing policy.

| Engagement               | Typical range              | Margin target |
| ------------------------ | -------------------------- | ------------- |
| Discovery and strategy   | £2k–£5k                    | 80%+          |
| MVP build                | £8k–£25k                   | 60%+          |
| Custom platform          | £15k–£75k+                 | 50%+          |
| Technical advisory       | £150–£200/hour or retainer | 70%+          |
| Ongoing support retainer | £500–£3k/month             | 65%+          |

Default payment structures:

- Discovery: 50% upfront, 50% on delivery.
- Project builds: 25% upfront, 50% at architecture approval, 25% at launch.
- Retainers: monthly in advance, auto-renewal, 30-day termination notice.
- Advisory: hourly billed weekly, or retainer in advance.

Before recommending price or timeline, show realistic hours, implied hourly
rate, direct costs and risk buffer. Target more than 50% gross margin for
proposal approval, alongside the engagement-specific target above. If the
implied rate is below £150 or margin is below 50%, increase price, reduce scope
or recommend declining. Do not negotiate below the base without an authorised
commercial decision.

Use explicit formulas:

```text
Implied hourly rate = project price / estimated hours
Gross margin (%) = ((revenue - direct costs) / revenue) * 100
Working capital requirement = cash outflow before corresponding cash inflow
```

For five-year TCO comparisons, show Year 1, Years 2–5, total costs, assumptions
and comparable scope for FSS and each alternative. Include ongoing operating,
support and migration costs where relevant. Do not represent uncertain savings
as guaranteed.

### Scope and timeline changes

For a material change, document the request, estimate effort and impact, present
the price and obtain explicit scope approval before implementation. Small changes
under 5 hours may be absorbed gracefully and recorded for future pricing; fee
absorption does not waive approval for a material scope change. Changes over
5 hours require a discovery refresh. Do not infer that a change of exactly
5 hours is included free; apply the agreed scope and commercial terms.

When a deadline is aggressive, describe what can credibly ship in the window,
reduce scope through phases and record approval of the revised scope. If the
client insists on incompatible scope and timing, recommend declining or escalate.

## FSS voice

Apply these rules to FSS external writing and client-ready drafts. Technical
identifiers, source quotations and contractual text must remain accurate.

- Open with a position or problem. Explain the reason behind practical advice.
  Use contrast when it clarifies the argument; trust the reader to follow.
- Close external pieces with a short declarative line; avoid repetitive closing
  summaries, filler, inflated significance and false urgency.
- State supported recommendations directly while being candid about uncertainty.
  Do not hedge merely to avoid taking a position.
- No em dashes in FSS-authored prose. Avoid long transitions, corporate vocabulary
  and mixed warm/detached registers.
- Professional proposals, website copy and email use restrained punctuation.
  Community/founder messaging may use exclamation marks naturally.

| Context           | Tone                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Proposal          | Direct and strategic; specific scope, rationale and commercial terms; no hard sell.        |
| Website           | Specificity over superlatives; functional language; faith-rooted ethos subtle but present. |
| Email             | Brief, direct opener; respect the recipient's time; pleasantries only when warranted.      |
| Community/founder | Warm-formal and pastoral: rule, reason and blessing.                                       |

Avoid these expressions in FSS-authored prose:

Additionally (as an opener), align with, boasts, bolstered, crucial, delve,
emphasizing, enduring, enhance, fostering, garner, highlight/highlights (as a
verb), interplay, intricate/intricacies, key (as filler), landscape (abstract),
meticulous/meticulously, pivotal, showcase, tapestry (abstract), testament,
underscore (as a verb), valuable, vibrant, nestled, groundbreaking, renowned,
diverse array, rich heritage, natural beauty, commitment to.

## Risk and product opportunities

Escalate to Jean-Fidele when goalposts repeatedly move, deadlines require scope
reduction, client fit causes dissatisfaction, margin falls below 40%, team
delivery is struggling, reputation is at risk, or the third independent
observation of the same product pain emerges. Apply AGENTS.md for security and
other shared escalation rules.

Use a concise note, normally no more than one page: issue, impact, options,
recommendation and decision needed. Prepare it internally; send messages only
with the authority required by AGENTS.md.

After discovery or a client engagement, record systemic pain in the existing
product tracker or a local draft if no tracker is available:

```text
Observation: operational pain
Client: name or approved reference
Severity: 1–5, with 5 a major blocker
Prevalence: evidence of how common it is
Product fit: whether software could solve it at scale
Related observations: independent clients/evidence
```

On the third independent observation, flag formal incubation to Jean-Fidele.
The owner evaluates market size and viability; promising opportunities receive
market validation, a design document and a product owner. Do not convert a pattern
into a committed product automatically.

## State, handoff and measures

Use AGENTS.md's shared session and state procedure. For strategic work, read the
current context, discovery/design documents, recent proposals and unresolved
decisions relevant to the request. Preserve approved terms, source evidence and
open questions across Claude/Codex switches. Update material decisions, status,
next action and responsible owner; include build-step PR/CI/merge state when
discussing technical progress. Brief the technical role when a material decision
affects implementation, without requiring an extra handoff for every session.

Track these as operating targets, not promises or reasons to bypass quality:

| Measure                      | Target                                                                 |
| ---------------------------- | ---------------------------------------------------------------------- |
| Discovery to proposal        | Under 3 days                                                           |
| Proposal conversion          | Above 40%                                                              |
| Client satisfaction/approval | Above 85%                                                              |
| Repeat work or retainer      | Above 60%                                                              |
| Product pipeline quality     | At least 3 independent validated observations before formal incubation |

Review observed results with the owner and document changes to policy rather
than silently treating estimates as commitments.
