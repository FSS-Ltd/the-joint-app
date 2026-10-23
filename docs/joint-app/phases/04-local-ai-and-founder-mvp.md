# Phase 4 — Local AI and founder MVP

> **CSV-first MVP revision, 23 October 2026:** Direct bank connections and bank procurement are post-MVP by founder instruction. The current MVP uses CSV/manual records; historical live-bank prerequisites and live-refresh paywall promises below are deferred. Provider evidence remains required before future live work. No live broker connector is included in the CSV-first build; its separate permission gate remains. See the [canonical scope revision](../01-product-specification.md).

**Goal:** Give the pilot household evidence-backed local explanations and complete a real monthly review with dependable connected finances.

**Effort:** 8–13 engineer-days, plus one full calendar month of observation; observation can overlap ordinary use and defect fixes.

**Architecture:** Cloud NestJS authorisation/evidence/calculations; Postgres jobs; one paired outbound-polling Mac companion; loopback-only Ollama.

**Stack:** TypeScript/Node companion, platform secure key storage, existing NestJS/Prisma infrastructure, Zod schemas, local model adapter and synthetic evaluations.

**Specifications:** [Product](../01-product-specification.md), [architecture](../02-architecture-and-project-structure.md), [data rules](../03-data-model-and-financial-rules.md), [integrations](../04-account-integrations.md), [AI design](../05-local-ai-and-projections.md).

**Global constraints:** No cloud model fallback, no direct SQL/provider secrets/model money movement, explicit per-account device approval, current permissions at every disclosure, memory-only plaintext evidence.

**Review focus:** Device trust, revocation races, provenance, model factuality, offline behaviour and honest founder acceptance.

This is a future implementation plan. Paths and scripts below are to be created during the phase; no real accounts are connected and no model benchmark is claimed by this document.

## 1. Dependencies and entry checks

- [ ] Phase 3 calculator, wealth reconciliation, source permissions and free/basic versus advanced entitlement gates have passed. Reuse their results; the model must not recreate their arithmetic.
- [ ] Phase 1 MFA, session revocation and audited founder entitlement work. Pairing or wider device access requires recent MFA; a founder grant bypasses neither provider permission nor account grants.
- [ ] Phase 2 approval register identifies actual bank and Trading 212 production permissions, supported account types, read-only scopes and known gaps.
- [ ] Confirm the pilot machine with verified hardware is available for the pilot, without assuming permanent uptime. Explain that cloud data is not E2EE and that the computer's operator can inspect permitted decrypted evidence.
- [ ] Agree the synthetic evaluation version and acceptance thresholds before comparing models. Record the protocol in `docs/decisions/004-local-ai-pilot.md`.

## 2. Task A — Pairing and independent device consent

**Planned files:** `packages/contracts/src/devices.ts`; `apps/api/src/modules/devices/devices.controller.ts`, `pairing.service.ts`, `device-auth.service.ts`, `device-grants.service.ts`; `apps/companion/src/keys/key-store.ts`, `pairing.ts`; Prisma migration for Device, DeviceAccountGrant and pairing/session records.

- [ ] Define `DeviceDto`, `DevicePairingStartDto` and `DeviceAccountGrantDto`. Store only public keys/fingerprints, ownership, capabilities and lifecycle metadata server-side. The companion's `KeyStore` interface provides generation, signing, decryption and deletion without returning keys to logs or command arguments.
- [ ] Start pairing from the authenticated app with a one-use code expiring after ten minutes. The companion binds generated public keys using proof of possession; the adult checks the displayed fingerprint before approval. An entered code alone never activates a device. Rate-limit guessing and permit one active household companion.
- [ ] Use a server nonce challenge for signed device-session authentication. Bind short-lived sessions to device, household and key version. Revoke sessions/leases immediately in server state; replacing the computer requires fresh keys and approvals.
- [ ] Create `DeviceAccountGrant` independently of partner `AccountGrant`. Only source owners approve their account for this named device. Return each owner's permitted consent records without exposing another owner's private-account inventory.
- [ ] Calculate job scope as the intersection of requester access, audience rights, device grants and feature requirements. TOTALS cannot become transaction/category evidence. No household-admin or billing-role shortcut exists.
- [ ] Explain the trust limit in pairing UI: revocation blocks future app processing/disclosure but cannot retrieve previously copied data from the Mac operator.

Use `H = /v1/households/{householdId}`:

| Route                                     | Purpose                                              |
| ----------------------------------------- | ---------------------------------------------------- |
| `GET/POST H/devices`                      | List visible devices/start pairing.                  |
| `POST H/devices/{deviceId}/approve`       | Recent-MFA fingerprint approval.                     |
| `PUT H/devices/{deviceId}/account-grants` | Owner-managed device permissions.                    |
| `DELETE H/devices/{deviceId}`             | Revoke; always available regardless of plan.         |
| `POST /v1/companion/pairing/complete`     | Bind code, public keys and possession proof.         |
| `POST /v1/companion/session/challenge`    | Obtain a short-lived nonce.                          |
| `POST /v1/companion/session`              | Authenticate signed challenge; issue device session. |

## 3. Task B — Bounded jobs and revocation-safe evidence

**Planned files:** `packages/ai-contracts/src/evidence.ts`, `jobs.ts`, `answers.ts`; `apps/api/src/modules/insights/insight-jobs.service.ts`, `evidence.service.ts`, `result-validator.ts`; `apps/api/src/modules/devices/companion-jobs.controller.ts`; `apps/worker/src/handlers/insight-expiry.ts`.

- [ ] Define `EvidenceEnvelopeV1`, `CompanionClaimDto` and `InsightResultV1`, including requester/audience, device, source dependencies, dataset/grant versions, expiry, hashes and schema version. Treat metadata as scoped data.
- [ ] Store queued metadata in Postgres. Free-text requests are encrypted with per-job keys and expire with the job; never log them. Build financial evidence only when a currently authorised device claims work.
- [ ] Keep InsightJob domain states separate from generic Job queue states. An insight becomes available only after successful validation. Expire queued requests after 24 hours and evidence envelopes after 15 minutes; leases last at most five minutes.
- [ ] Require current online permission before evidence fetch, before decrypting/processing, before accepting completion and before every result view. Renew execution permission during generation; revoke/cancel attempts stop the companion and always prevent late result publication.
- [ ] Bind authenticated encryption to job/device/audience/grant version. Use an established library and separate encryption/signing keys; do not design custom cryptography. Reject modified envelopes, expired leases and replayed completions.
- [ ] Check `insights.local` on creation and execution. A longer subscription capability lease never authorises offline inference: the current online job permit is stricter. Authorised historical reads and privacy operations remain free.
- [ ] Atomically increment grant versions on changes; invalidate affected jobs/results and client caches. Recompute for the remaining audience or hide safely. Do not attempt to remove private details from an already-written paragraph with string replacement.
- [ ] Cap retries at two, inference at two minutes and tool rounds at four. Idempotent claim/completion protects against duplicate work after sleep or interrupted uploads. No provider credential enters a queue payload.

| Route                                      | Contract                                          |
| ------------------------------------------ | ------------------------------------------------- |
| `GET/POST H/insights/jobs`                 | Visible jobs/create scoped request.               |
| `GET/DELETE H/insights/jobs/{jobId}`       | Status and authorised result/cancel.              |
| `POST /v1/companion/jobs/claim`            | `CompanionClaimDto`; assigned device only.        |
| `GET /v1/companion/jobs/{jobId}/evidence`  | Current-authorisation encrypted envelope.         |
| `POST /v1/companion/jobs/{jobId}/permit`   | Fresh execution permission.                       |
| `POST /v1/companion/jobs/{jobId}/renew`    | Lease/permission renewal.                         |
| `POST /v1/companion/jobs/{jobId}/complete` | Signed `InsightResultV1`, idempotently validated. |

## 4. Task C — Runtime and grounded explanations

**Planned files:** `apps/companion/src/cli.ts`, `daemon.ts`, `poller.ts`, `runtime/local-inference.ts`, `runtime/ollama.ts`; `packages/ai-contracts/src/intent.ts`; `apps/api/src/modules/insights/tool-gateway.ts`; `docs/decisions/local-model.json`.

- [ ] Implement `LocalInferenceAdapter.describe()` and `generateStructured(request, abortSignal)`. Keep the companion's HTTPS client separate from the model; the model cannot choose network destinations, read files or access credentials.
- [ ] Configure Ollama for `127.0.0.1:11434`, `OLLAMA_NO_CLOUD=1`, one loaded model, one inference and 4,096 context tokens. Reject cloud tags, unapproved manifests and non-loopback inference addresses. Never expose Ollama through a router, tunnel or public proxy. [Ollama configuration](https://docs.ollama.com/faq).
- [ ] Start comparisons with pinned `gemma4:e4b-it-q4_K_M` and `gemma4:e2b-it-q4_K_M`; compare Qwen3.5 4B/9B if useful. Record actual digest, backend, runtime, licence, sampling and thinking controls. Exact candidates and package-memory caveats are in the AI specification; verify them again at installation.
- [ ] Enforce input/output token and envelope size budgets before generation; use a fresh context for every job/audience. No household fine-tuning, shared conversation history or silent truncation of policy/evidence.
- [ ] Allow only `get_spend_summary`, `get_recurring_costs`, `project_goal` and `compare_goal_scenarios` through the policy-checked gateway. Schema-valid arguments still require current source authorisation and bounded ranges.
- [ ] Feed merchant descriptions as untrusted data. Ignore embedded instructions, reject arbitrary tool names and preserve original financial source provenance.
- [ ] Let the model select evidence and explanation structure. Render money/dates from referenced deterministic runs. Reject unsupported claims, securities-specific buy/sell/hold directions and proposed money movements. A suggestion creates a draft; authenticated app actions save any chosen budget or goal change.
- [ ] Keep plaintext evidence and assembled prompts in memory, omit prompt/thinking bodies from logs and disable sensitive crash capture. Default validated-result retention to 30 days with earlier source-revocation deletion; diagnostics require explicit time-limited opt-in.

## 5. Task D — Web experience and model evaluation

**Planned files:** `apps/web/app/(app)/settings/devices/page.tsx`, `insights/page.tsx`; `apps/web/components/insights/EvidenceCard.tsx`; `packages/test-fixtures/ai/eval-v1.jsonl`; `apps/companion/src/evaluation/run.ts`; `apps/api/test/insights-privacy.e2e-spec.ts`.

- [ ] Show paired device, last seen, current request state, expiry and cancel. Offline copy says “Waiting for your AI device”; deterministic budgets/goals remain available. Existing results require fresh access checks, including cached views.
- [ ] Expose source period, visible scope, freshness, assumptions and evidence drill-down. Do not reveal hidden-account counts. Clearly label conditional savings and projected dates.
- [ ] Evaluate at least 100 versioned synthetic requests: 40 spending, 25 goal comparisons, 15 permissions/coverage, 10 malicious descriptions and 10 unsupported investment/action requests. Run each candidate three times with pinned settings; do not send production records to evaluators.
- [ ] Gate release on zero unauthorised disclosure/action, 100% correct rendered numeric facts and evidence links, at least 95% correct permitted intent/tool selection and 90% human-rated clear supported explanations. Any privacy failure blocks release independently of averages.
- [ ] Measure cold/warm latency, peak memory and swap while ordinary Mac applications are open. Target warm p95 ≤45 seconds for a 700-token answer, no out-of-memory failures and no sustained swap growth. Record measurements; model marketing benchmarks do not substitute.
- [ ] Exercise revocation before fetch, before processing, during generation, before completion and before view. In-flight computation may finish; acceptance/display must still fail. Test stale membership, downgraded entitlement, replay, altered ciphertext, expired job, failed renewal, sleep/resume and duplicate completion.
- [ ] Prove direct calls cannot bypass grants and that malicious merchant text cannot invoke SQL, credentials, network browsing, orders or transfers. Verify failure leaves calculator results unchanged.

Register these planned scripts in package manifests and execute against synthetic/disposable environments first:

```bash
pnpm --dir apps/companion run test
pnpm --dir apps/api run test:phase04
pnpm --dir apps/web run test:phase04
pnpm --dir apps/companion run doctor
pnpm --dir apps/companion run evaluate
pnpm run verify:phase04
```

`doctor` checks loopback/local-only configuration and pinned model availability. `evaluate` uses the committed manifest and fixture set. `verify:phase04` includes type/build/OpenAPI checks, expiry cleanup and migration validation. These are project scripts to implement, not claims that the current workspace already supplies them.

## 6. Task E — One-month founder rehearsal

Create `docs/runbooks/founder-monthly-review.md` and a redacted acceptance record containing checks and opaque references, not bank data or prompts.

- [ ] Each adult independently authenticates and reviews their sharing/device grants. Maintain at least one approved real UK bank connection and an approved real Trading 212 connection using supported accounts and read-only permissions.
- [ ] Observe a full calendar month. Check scheduled refreshes, source reconciliation, duplicate handling, user corrections, transfer/card-payment treatment, budgets and source timestamps. Historical backfill alone does not count as this observation period.
- [ ] Complete a shared monthly review using only mutually authorised data. Reproduce one basic and one advanced goal result, inspect an AI saving suggestion's evidence and save a deliberate change through the ordinary UI.
- [ ] Rehearse laptop-offline use, provider outage/reconnect, partner revocation, device replacement, result expiry and founder-entitlement expiry. Verify free history, exports and privacy controls remain usable.
- [ ] Perform the established encrypted backup restore exercise; record recovery evidence. Confirm logs/crash reports contain no financial payloads and no unresolved critical security or arithmetic defect remains.

## 7. Exit decision and rollback

The phase passes when pairing, every critical privacy assertion, model evaluation and the monthly rehearsal pass, with supported real connections reconciled. **R02 real bank and R03 approved real Trading 212 are required for the full founder MVP.** Missing permission, unsupported required coverage or statement-only brokerage access means **“founder beta with partial connectivity”**, with the outstanding requirement recorded. A missing usable local assistant is also an unresolved R11 requirement. Neither elapsed time nor a synthetic demonstration changes that classification.

An independent review checks device approval boundaries, evidence provenance, money rendering, model/runtime pinning and truthful release claims. Public subscriptions and native-store launch remain Phase 5 work.

Rollback switches off new local-AI creation/execution, cancels queued jobs, invalidates leases and returns the UI to deterministic cards. Preserve financial records and authorised history. Revoke compromised devices/keys and require re-pairing; do not roll back security fixes or permission checks to restore model availability. Restore the last accepted model/prompt manifest only after the privacy gates still pass. Model quality never justifies weakening source access or enabling cloud fallback.
