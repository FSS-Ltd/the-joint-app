# The Joint App: local AI and deterministic projections

**Specification date: 22 October 2026.** This is an implementation design, not a report of completed hardware benchmarks. Model availability and documentation below were checked on this date. Money examples are synthetic.

## 1. Recommended decision

Build the goal calculator in **Phase 3**, before adding the optional local assistant in **Phase 4**. The calculator owns every balance, saving estimate and projected date. The language model interprets a question, selects a permitted calculation and explains its evidence. A model failure must never change a financial result.

Use the compatible Mac, with hardware and memory to be confirmed for a synthetic pilot. Start by evaluating **Gemma 4 E4B, Q4_K_M**, with E2B as the smaller alternative. Gemma 4 is verified: Google's release history lists the first sizes on 31 March 2026 and 12B Unified on 3 June 2026. Its official model card lists Apache 2.0 licensing and native function calling. [Google releases](https://ai.google.dev/gemma/docs/releases), [model card](https://ai.google.dev/gemma/docs/core/model_card_4).

The machine is not assumed to be dedicated or always on. Closing its lid, leaving home without it or stopping the companion pauses new AI answers. Household accounts, budgets and deterministic projections continue through the cloud API. The app says “Waiting for your AI device” and provides the calculator immediately. It never silently switches to a cloud model.

### What “local” means

| Property                   | Initial design                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Local inference            | Model execution takes place on the paired Mac.                                                                                     |
| Operational financial data | Shared cloud database: Supabase Postgres and Auth, London `eu-west-2`; private finance schema accessed through NestJS.             |
| Local data                 | The companion receives only the permitted evidence needed for a job; it does not mirror the household database.                    |
| Mobile inference           | Neither the Next.js PWA nor the later Expo app needs to run a model. Both use the same NestJS API.                                 |
| Encryption claim           | Transport and storage encryption, plus an encrypted companion envelope. The operational database is **not end-to-end encrypted**.  |
| Consumer expansion         | Each household supplies its own compatible companion initially; a pilot computer never becomes customers' shared inference server. |

Users must understand that selected data travels from the app's cloud service to their named computer. “Local AI” does not mean that all account data stays off cloud infrastructure.

## 2. Models and runtime: illustrative 16 GB baseline

The following are confirmed candidates, not a claim that the newest model always wins this task. All four model cards identify Apache 2.0 licensing. The listed downloads are **Ollama package sizes, not total runtime RAM**.

| Candidate and explicit Ollama tag | Package | Published context | Pilot role                                                                  |
| --------------------------------- | ------: | ----------------: | --------------------------------------------------------------------------- |
| `gemma4:e4b-it-q4_K_M`            |  6.6 GB |              128K | First Gemma candidate; evaluate accuracy and memory under normal Mac usage. |
| `gemma4:e2b-it-q4_K_M`            |  4.6 GB |              128K | Smaller fallback if E4B causes memory pressure or unacceptable latency.     |
| `qwen3.5:4b-q4_K_M`               |  3.3 GB |           262,144 | Compact comparison candidate for structured intent and explanations.        |
| `qwen3.5:9b-q4_K_M`               |  6.6 GB |           262,144 | Larger comparison if it materially improves this app's evaluation results.  |

Package sources: [E4B](https://ollama.com/library/gemma4:e4b-it-q4_K_M), [E2B](https://ollama.com/library/gemma4:e2b-it-q4_K_M), [Qwen 4B](https://ollama.com/library/qwen3.5:4b-q4_K_M), [Qwen 9B](https://ollama.com/library/qwen3.5:9b-q4_K_M). Qwen's official cards document context, licensing and tool use: [4B](https://huggingface.co/Qwen/Qwen3.5-4B), [9B](https://huggingface.co/Qwen/Qwen3.5-9B).

Gemma's “effective” sizes are not total weight counts: Google's card gives E2B 5.1B parameters including embeddings and E4B 8B. Its memory guide distinguishes static weights from context memory and explains why the 26B mixture-of-experts model still needs its full weights available. Do not select it because “A4B” sounds like a 4B download. The 26B and 31B models are outside the illustrative 16 GB configuration; 12B is an optional later benchmark, not the starting default. [Google model card](https://ai.google.dev/gemma/docs/core/model_card_4), [memory guidance](https://ai.google.dev/gemma/docs/core).

Use **Ollama for the synthetic pilot**, behind a runtime adapter. Its documented API supports tool calls and schema-constrained output. Keep llama.cpp as the alternative when tighter packaging, Metal configuration or a controlled GGUF build becomes valuable. Both runtimes use MIT licences; model licences remain separate, and distribution must preserve applicable notices. [Ollama tools](https://docs.ollama.com/capabilities/tool-calling), [structured output](https://docs.ollama.com/capabilities/structured-outputs), [Ollama licence](https://github.com/ollama/ollama/blob/main/LICENSE), [llama.cpp](https://github.com/ggml-org/llama.cpp).

Pin the runtime release, model manifest digest, quantization, backend and prompt version. Avoid `latest` or an unqualified size alias: Ollama currently lists multiple backend packages under some Gemma aliases. Start with one loaded model, one active inference and a **4,096-token context**; permit 8,192 only after measuring it. Keep evidence compact and reserve output tokens. Advertised maximum context is not a workable memory budget: larger context and parallel requests consume additional memory. [Ollama tags](https://ollama.com/library/gemma4/tags), [context](https://docs.ollama.com/context-length), [FAQ](https://docs.ollama.com/faq).

Benchmark cold start, completion latency, peak resident memory, swap growth and accuracy while the browser and development tools are open. A proposed pass target is a 700-token answer within 45 seconds at the 95th percentile when warm, no out-of-memory errors and no sustained swap growth. These are acceptance targets, not measured performance. If none pass, keep deterministic cards and improve the payload before buying hardware. Use supported non-thinking mode where suitable; inspect the installed model's controls instead of assuming every model accepts the same flag. [Thinking controls](https://docs.ollama.com/capabilities/thinking).

## 3. Companion, permissions and offline behaviour

Implement a small TypeScript/Node companion CLI, then a signed installer and daemon when the pilot justifies it. It calls Ollama on `127.0.0.1:11434` and makes **outbound HTTPS** requests to the app. No router port forwarding, public Ollama endpoint, arbitrary proxy or browser-to-Ollama connection is needed. Ollama's local API is unauthenticated; loopback binding is therefore a deployment requirement. Set `OLLAMA_NO_CLOUD=1`, allow only pinned local manifests and reject cloud models. [Authentication](https://docs.ollama.com/api/authentication), [local-only configuration](https://docs.ollama.com/faq).

Pair one device per household initially. An authenticated adult approves a short-lived pairing code, checks its displayed fingerprint and gives it a recognisable name. The companion creates device signing/encryption keys; private keys belong in the operating system's secure credential store. The server stores public keys, owner, household, key version and revocation state. Use short-lived device sessions with proof of key possession; there are no bank, broker, Supabase service-role or database credentials on the companion. Device revocation invalidates sessions and leases; replacing the computer requires new keys and owner approvals.

Pairing is not permission to analyse everybody's accounts. Each account owner separately opts their permitted data into the named device. For a job, intersect current account grants, requesting user's rights, intended audience, device approval and requested feature. `NONE` permits nothing, including account-existence disclosure; `TOTALS` permits approved balance/valuation totals; `TRANSACTIONS` permits authorised detail, including holdings. Category spending requires transaction-level access. A household administrator cannot override another adult's account grants. Child profiles remain parent-managed; child data never becomes an independent login or consent shortcut.

The person controlling the Mac is inherently trusted with decrypted permitted evidence. UI access controls cannot prevent that operator copying memory or outputs. Explain this before an owner approves the device. Revocation prevents subsequent authorised processing and disclosure; it cannot recover information already viewed or copied.

### Bounded job protocol

Use Postgres-backed jobs with the NestJS worker; Redis is unnecessary initially. A job carries requester and audience scopes, never a household-wide wildcard.

1. **Create:** authorise the request and store minimal job metadata. Expire queued requests after 24 hours. A preset request needs only typed parameters; any queued free-text question is encrypted with a per-job key, shares that expiry and is excluded from logs. Do not enqueue bank tokens, merchant descriptions or complete account histories.
2. **Claim and fetch:** the companion polls with backoff. Recheck device, membership and grants before issuing a five-minute lease. Build a fresh scoped evidence snapshot; encrypt it to the paired device using an established authenticated-encryption library. Give this envelope a 15-minute maximum life and bind job, device, audience and grant version to it.
3. **Before processing:** obtain a fresh online execution permit and recheck its scope before decryption/inference. Require periodic lease renewal; an offline or revoked companion stops. Cap execution at two minutes and tool rounds at four. Cancellation is best effort for already-running computation; its result is still rejected after revocation.
4. **Before accepting results:** verify device signature, lease, expiry, snapshot hash and current grants. Apply schema, evidence and output policy checks. Reject revoked, altered, expired or duplicate results. Permit at most two bounded retries; use idempotency keys for claim and completion.
5. **Before every view:** authorise the current viewer against all source dependencies. Invalidate derived cards when a source grant narrows. Recompute for the new audience instead of attempting to redact a potentially revealing paragraph.

State transitions are `queued → leased → running → validated → available`, with explicit `expired`, `cancelled`, `failed` and `revoked` endings. A privacy change invalidates pending payloads and results atomically with the grant-version update. Clients clear affected cached cards. Sensitive cached insights must not bypass a fresh access check.

Mobile displays device availability, request age and cancellation. If the Mac disappears, the rest of the app continues while its cloud connection is available. Previously generated results remain viewable only after current authorisation; expired jobs require a fresh request and fresh evidence. Default assembled prompts, inference traces and plaintext evidence to memory-only handling; disable body logging and crash dumps containing payloads. Give each job and audience a fresh model context, with no shared conversation memory or training on household data. Retain user-visible validated cards for a short configured period, initially 30 days, with deletion on revocation. Audit identifiers, decisions, versions and error codes, not financial narrative. Diagnostic payload collection needs explicit, time-limited opt-in.

## 4. Keep the model inside a narrow contract

The model gets no SQL, shell, filesystem, arbitrary URL-fetch, banking or trading tool. Treat merchant text and imported descriptions as untrusted data; bound their length, escape control characters and keep them outside instruction fields. Never give the model a connection secret. Deterministic code enforces permissions even when a model requests an allowed tool with malicious arguments.

Expose these read-only tools through a policy-checked gateway:

| Tool                     | Inputs and result                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `get_spend_summary`      | Approved scope token, complete-month range, category IDs; returns totals, coverage and evidence references.           |
| `get_recurring_costs`    | Approved scope and lookback; returns observed recurring candidates and uncertainty, never claims a service is unused. |
| `project_goal`           | Existing goal ID plus validated scenario parameters; returns a versioned calculation.                                 |
| `compare_goal_scenarios` | Two authorised scenario IDs; returns calculated contribution and timing differences.                                  |

The server resolves account scope; user-supplied account IDs cannot widen it. The first model response may parse intent into a schema. Ambiguous requests produce a choice in the app before assumptions are saved. Calculations run in a pure shared TypeScript package called by NestJS, independently of the companion. The final model response selects approved insight types and evidence IDs. The renderer fills amounts and dates from the calculation; unsupported claims are rejected. Schema compliance alone does not establish truth.

A suggested budget change is a draft. Only a separate authenticated user action saves it. The app does not cancel subscriptions, transfer money, submit orders or allocate actual investments. Avoid personalised securities recommendations, suitability claims and product-specific buy/sell/hold directions. General explanations and user-selected hypothetical growth assumptions are within the intended product scope. This scope still requires the commercial perimeter review: the FCA describes circumstances-based personal recommendations, and a disclaimer does not neutralise unsuitable substantive behaviour. [FCA PERG 8.30B](https://handbook.fca.org.uk/handbook/perg8/perg8s41).

## 5. Financial definitions the engine must preserve

Use signed integer minor units in storage and decimal strings in JSON; use decimal arithmetic for rates and FX. Every input includes currency, source, valuation/booking time and provenance. Do not add different currencies before conversion with a recorded exchange rate and timestamp.

**Spending** is posted consumption, interest and fees, less refunds recognised in their posting month. Pending charges appear separately and reduce forecast available cash once, but are replaced rather than duplicated when posted. Refunds may make a category negative; do not silently clamp them. Own-account transfers, investment purchases and debt principal are excluded from consumption. A credit-card purchase is spending; its matched repayment is a transfer. A loan repayment must be split into principal and interest, or shown as uncertain until resolved.

**Income** is classified external income such as salary and benefits. Loan advances, asset-sale proceeds, transfers, investment withdrawals and refunds are not salary-like income. Contributions to an investment account are not investment returns. Reinvested dividends cannot be counted both as new household contributions and again inside total return. A closing-minus-opening balance change must be adjusted for external flows before being labelled an investment gain; it is not a time-weighted return without an implemented cash-flow timing method.

**Current savings** is a clearly labelled stock of eligible liquid balances. Exclude credit limits, uncleared funds, unsettled sale proceeds and money reserved for bills from deployable goal cash. **Net goal contributions** is a flow into a goal allocation. **Available monthly contribution** is a budget calculation. Keep these names distinct: a transfer into savings does not itself create household wealth.

**Net worth** equals distinct adult-owned economic assets less liabilities at a declared valuation time. Count a shared account once; identify duplicates imported by both partners. Normalise an overdraft as a liability once. Count brokerage holdings and uninvested cash, or a reconciled provider total, never both. A pie is a grouping of holdings, not an additional asset. Show stale prices and estimated property separately. Pensions can appear in net worth while remaining unavailable for an accessible-cash goal. Child-owned assets are excluded from adults' net worth and spendable funds by default; an optional family-combined view labels their ownership and restrictions.

**Goals are virtual allocations.** A cash allocation references an eligible real balance; an investment allocation references owned units or a fraction whose current value changes. Sum of cash allocations plus reserves cannot exceed eligible source cash; allocated investment fractions cannot exceed one. Assigning £1,000 to two goals does not create £2,000. Transfers between accounts preserve total goal funding unless the user explicitly reallocates it. Forecast contributions across all concurrent goals must fit one household contribution plan, with an explicit priority or split. A what-if forecast may exceed that budget only when marked hypothetical and unfunded.

### Baseline and irregular income

Show observed spending over the last **3, 6 and 12 complete calendar months**, with coverage and excluded items. Default the initial discretionary baseline to the three-month monthly mean; display six- and twelve-month comparisons to reveal seasonality. Do not annualise an incomplete month. Missing connection coverage is missing data, not a zero-spend month.

For stable pay, propose the median of the last three complete monthly income totals and request confirmation when a pay change is known. For variable income, show mean and median over each available window; with twelve complete months, offer a conservative 25th-percentile monthly total alongside the median. Specify nearest-rank percentile calculation and include genuine zero-income months. Bonuses and exceptional receipts stay visible with explicit inclusion rules. Fewer than three complete months produces “insufficient history” and a manually entered contribution plan.

Calculate contribution capacity from an explicit cash budget: income assumptions less essential obligations, discretionary allowances, tax provisions, sinking-fund provisions, required payments on pre-existing debt and reserve top-ups. Reconcile this with a dated cash schedule. A card purchase is provisioned once; settling it releases the provision rather than creating a second expense. An annual bill funded from a sinking fund must not also reduce capacity a second time. Unknown debt splits or missing accounts reduce confidence; the model cannot declare that unexplained cash is safe to spend.

Savings suggestions compare the chosen baseline with a user-selected reduction or cap. A £240 monthly takeaway baseline and £200 cap imply a **conditional £40 monthly difference**, not a promise. Detect overlapping changes so a merchant cancellation and its category cut are not counted twice. Show source period, affected spending and the behaviour required; avoid inferring health, relationships or other sensitive traits from merchants.

## 6. Projection mathematics and dates

Projection inputs are explicit: opening eligible balance, target, first contribution date, monthly contribution schedule, withdrawals, horizon, growth, fees, tax assumptions and whether the target is today's money or a fixed future nominal amount. Start cash goals at 0% growth unless the user enters an applicable rate. Investment scenarios include loss and zero-growth cases; illustrative annual assumptions such as −5%, 0% and +5% are editable examples, not expected returns or confidence intervals.

For monthly periods, let `B[m]` be the closing balance, `C[m]` end-of-month contributions, `W[m]` withdrawals, `F[m]` fixed fees and `T[m]` explicitly modelled tax. If `r_y` is an effective annual gross return and `f_y` an effective annual proportional fee drag, define:

```text
g = ((1 + r_y) * (1 - f_y))^(1/12)
B[m] = round_minor(B[m-1] * g + C[m] - W[m] - F[m] - T[m])
```

Use decimal precision and a versioned half-up minor-unit rounding rule. This convention applies growth and proportional fees before the month's contribution. Fee providers may use different charging conventions; document the approximation. Never subtract an expense already included in a supplied net return. Unknown taxes or charges are labelled unmodelled, not silently assumed irrelevant. Require `r_y ≥ -1` and `0 ≤ f_y < 1`; a depleted balance does not become an invented borrowing facility. Beginning-of-month contributions require a separately labelled recurrence. Weekly or irregular contributions must be aggregated into the displayed monthly approximation, or handled by a later dated-event engine.

At **zero growth with no fees, withdrawals or tax**, `B[n] = B[0] + n*C`. For `target > B[0]` and `C > 0`, contribution count is `ceil((target-B[0])/C)`. The canonical golden fixture is **£1,000 opening balance + £250 each month → £4,000 after 12 contributions**. If the first payment is 30 November 2026, the twelfth is 31 October 2027. An extra £40 makes the contribution £290 and reaches the target after 11 contributions, on 30 September 2027. These dates follow the schedule, not an arbitrary “months from today” calculation.

For constant monthly net growth `r = g-1`, the unrounded closed form is:

```text
B[n] = B[0]*(1+r)^n + C*((1+r)^n - 1)/r    when r != 0
```

Use it as an independent mathematical check; the rounded recurrence is authoritative. Negative returns can delay or prevent reaching a target. For a target expressed in today's money and annual inflation `i > -1`, compare against `target[m] = target[0]*(1+i)^(m/12)`. Alternatively display `B[m]/(1+i)^(m/12)` in today's money. Do not mix a real balance with an already-inflated target. Fixed nominal contributions do not automatically rise with inflation.

Iterate to the first month satisfying the target, up to a configured 600-month horizon. Return `already_achieved`, `reachable`, `insufficient_inputs`, `budget_deficit`, `depleted`, `unreachable_under_assumptions` or `beyond_horizon`, with reasons. Use “unreachable” only when established, such as a shortfall with zero contributions and no positive growth; failure to reach within 600 months is only “beyond horizon”. Do not use logarithms without checking their domain or replace failure with an invented distant date.

Results are conditional scenarios. Display projected month, assumptions and data date together. A fixed growth path is not a probability distribution; do not invent a likelihood of success. Cash balances, returns, income and spending may change. Freshness thresholds are connector-specific and versioned; stale or incomplete inputs show warnings and require an explicit assumption override before presenting a new actionable contribution plan.

## 7. Evidence and reproducibility contracts

Store a `ProjectionRun` with engine version, immutable input hash, account/valuation snapshot IDs, grant version, category rules, FX rates, scenario parameters, monthly series, result state and calculation timestamp. Edits create a new run. Identical inputs and engine version reproduce the same figures; LLM phrasing need not be identical. A source correction marks affected runs superseded.

Validate contracts at both boundaries: `ProjectionInput` contains the full schedule and assumptions defined above; `ProjectionResult` contains the result enum, first qualifying date, month-by-month balances, contribution total, growth/fee/tax breakdown and warnings. `InsightJob` contains requester, audience, device, grant epoch, lease, expiry and encrypted payload reference. `InsightResult` contains job and snapshot IDs, model/runtime/prompt versions, evidence references and an approved explanation structure. Reject unknown fields, excessive ranges and missing currencies rather than coercing them silently.

The minimal companion payload can look like this:

```json
{
  "schema": "joint.evidence.v1",
  "jobId": "job_example",
  "requesterId": "adult_a",
  "audience": "requester_only",
  "grantVersion": 17,
  "asOf": "2026-10-22T10:00:00Z",
  "currency": "GBP",
  "coverage": { "fullMonths": 3, "completeForApprovedScope": true },
  "facts": [
    {
      "id": "f1",
      "type": "category_monthly_mean",
      "category": "takeaway",
      "period": ["2026-07-01", "2026-09-30"],
      "amountMinor": "24000"
    },
    { "id": "f2", "type": "hypothetical_cap", "amountMinor": "20000" },
    {
      "id": "f3",
      "type": "conditional_monthly_difference",
      "amountMinor": "4000"
    }
  ],
  "projection": {
    "runId": "projection_example",
    "engineVersion": "1.0.0",
    "openingBalanceMinor": "100000",
    "targetMinor": "400000",
    "firstContributionDate": "2026-11-30",
    "contributionTiming": "month_end",
    "baselineContributionMinor": "25000",
    "proposedContributionMinor": "29000",
    "baselinePayments": 12,
    "proposedPayments": 11,
    "growthAnnual": "0",
    "feesAnnual": "0",
    "baselineDate": "2027-10-31",
    "proposedDate": "2027-09-30"
  },
  "warnings": ["Hypothetical spending change; outcome is not guaranteed"]
}
```

The server retains the authorised source dependency map; transaction identifiers, names and raw descriptions are unnecessary here. The model may choose an explanation linked to `f1–f3` and the run ID. The app renders the £40 difference and the dates directly. “Complete” means complete for the approved scope, never all household finances when some accounts are private or absent.

## 8. Delivery gates and evaluation

**Phase 3 — calculator:** implement normalisation, reconciliation, allocations and deterministic scenarios. Ship the goal controls and assumption editing without requiring AI. Validate the £1,000/£250/£4,000 fixture, zero contributions, negative growth, fees, inflation, leap years, month ends, multicurrency, pending-to-posted replacement, refunds, duplicate imports, card repayments, child ownership and conflicting goals. Use property tests for conservation and allocation limits; compare independent closed forms with explicitly bounded rounding differences.

**Phase 4A — personal companion:** pairing, revocation, outbound polling, local-only runtime and minimal evidence. Test laptop sleep, interrupted uploads, replayed completions, expired jobs and revocation at every fetch/process/result/view boundary. Keep deterministic cards available during every AI failure.

**Phase 4B — useful explanations:** build a versioned evaluation set of at least 100 synthetic requests: 40 spending questions, 25 goal comparisons, 15 permission/coverage cases, 10 malicious imported descriptions and 10 unsupported investment/action requests. Include ambiguous pay, multiple currencies and misleading merchant names. Run each candidate three times with pinned settings. Require zero unauthorised disclosures/actions, 100% correct rendered amounts/dates and source links, at least 95% correct permitted intent/tool selection, and at least 90% human-rated clear, supported explanations. These thresholds are release gates, not proof of safety; any privacy failure blocks release regardless of the average.

**Phase 4C — paid readiness:** signed companion updates, migration/rollback, deletion controls, supported hardware matrix, privacy and perimeter review, adversarial testing and support instructions. Re-run the evaluation suite for model, prompt, runtime or policy changes. Customer hardware and offline availability are a product constraint to validate before charging for local AI. Do not promise instant mobile answers from an intermittently available home computer.

## Primary source register

All checked **22 October 2026**; links are also placed beside the claims they support.

1. Google: [Gemma releases](https://ai.google.dev/gemma/docs/releases), [Gemma 4 model card](https://ai.google.dev/gemma/docs/core/model_card_4), [model and memory overview](https://ai.google.dev/gemma/docs/core).
2. Qwen: [Qwen3.5-4B official model card](https://huggingface.co/Qwen/Qwen3.5-4B), [Qwen3.5-9B official model card](https://huggingface.co/Qwen/Qwen3.5-9B).
3. Ollama registry: [Gemma tags](https://ollama.com/library/gemma4/tags), [E4B Q4_K_M](https://ollama.com/library/gemma4:e4b-it-q4_K_M), [E2B Q4_K_M](https://ollama.com/library/gemma4:e2b-it-q4_K_M), [Qwen 4B Q4_K_M](https://ollama.com/library/qwen3.5:4b-q4_K_M), [Qwen 9B Q4_K_M](https://ollama.com/library/qwen3.5:9b-q4_K_M).
4. Ollama documentation: [FAQ](https://docs.ollama.com/faq), [authentication](https://docs.ollama.com/api/authentication), [context length](https://docs.ollama.com/context-length), [tool calling](https://docs.ollama.com/capabilities/tool-calling), [structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [thinking controls](https://docs.ollama.com/capabilities/thinking), [MIT licence](https://github.com/ollama/ollama/blob/main/LICENSE).
5. ggml-org: [llama.cpp source, supported backends and MIT licence](https://github.com/ggml-org/llama.cpp).
6. FCA: [PERG 8.30B, personal recommendations](https://handbook.fca.org.uk/handbook/perg8/perg8s41).
