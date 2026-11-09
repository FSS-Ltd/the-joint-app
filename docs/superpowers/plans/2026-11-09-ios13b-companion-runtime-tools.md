# Design Document: IOS13b - Local Companion Runtime and Grounded Tool Gateway

Date: 2026-11-09  
Author: Technical Agent  
Status: Draft / Implementing  
Branch: feat/ios13b-companion-runtime-tools

---

## 1. Problem Statement

With the companion device protocol, consent isolation, and background job maintenance implemented in IOS13a, the platform requires the client-side local runtime that operates on the user's computer (Mac). This runtime connects outward to the cloud API, interacts with a loopback-bound Ollama instance (`127.0.0.1:11434`), executes deterministic read-only tools against decrypted in-memory evidence, and returns signed structured results.

Core requirements:

1. Outbound-only HTTPS to cloud API: No inbound open ports, port forwarding, or web-to-Ollama tunnels.
2. Local Ollama communication: Strictly binds to `127.0.0.1:11434` with `OLLAMA_NO_CLOUD=1`. Zero cloud model fallback.
3. Cryptographic key management: Local generation and storage of RSA/ECDSA keypairs, fingerprint display, challenge nonce signing.
4. Grounded Tool Gateway:
   - Exposes exactly 4 deterministic read-only tools: `get_spend_summary`, `get_recurring_costs`, `project_goal`, and `compare_goal_scenarios`.
   - Never exposes filesystem, shell, arbitrary network, or SQL tools to the model.
   - Enforces a hard limit of 4 tool rounds and a 2-minute total execution timeout per job.
5. Fresh online execution permit:
   - Verifies the job permit with the API immediately before model invocation. If the job is revoked, lease expired, or grants changed, the runtime terminates immediately.
6. Memory-only privacy boundary:
   - Plaintext evidence envelopes and user prompts exist solely in process memory during active inference. No writing of decrypted financial evidence to disk or console logs.

---

## 2. Architecture Approach and Key Decisions

### 2.1 Workspace Structure: `apps/companion`

Create `apps/companion` in the monorepo workspace (`@joint/companion`), importing:

- `@joint/contracts`: Typed schemas, job DTOs, companion API requests/responses.
- `@joint/projections`: Pure mathematical and projection engine for `project_goal` and `compare_goal_scenarios`.

### 2.2 Core Modules in `apps/companion`

1. `src/crypto/key-store.ts`:
   - Manages local device keypair (`companion_key.pem`) and device identity metadata (`device_identity.json`) in a configurable secure directory (`~/.joint-companion` or environment-specified path).
   - Generates 2048-bit RSA / P-256 keypairs with deterministic SHA-256 fingerprints.
   - Signs data strings and decrypts AES-256-GCM evidence envelopes.
2. `src/api/companion-client.ts`:
   - Outbound HTTP client communicating with `/v1/companion/*`.
   - Handles `completePairing`, `sessionChallenge`, `sessionAuth`, `claimJobs`, `getEvidence`, `checkPermit`, `renewLease`, and `completeJob`.
3. `src/runtime/ollama-adapter.ts`:
   - Interfaces with `http://127.0.0.1:11434`.
   - Supports tool definition mapping, structured chat completions, and model health verification.
   - Includes mockable transport for deterministic unit/integration testing without requiring live Ollama binaries in CI.
4. `src/tools/tool-gateway.ts`:
   - Validates model tool calls against permitted evidence.
   - Implements:
     - `get_spend_summary`: Evaluates category totals, transaction counts, and date spans from evidence.
     - `get_recurring_costs`: Computes recurring payment intervals and candidate frequencies.
     - `project_goal`: Invokes `@joint/projections` engine with evidence balances.
     - `compare_goal_scenarios`: Computes delta projections between two scenarios.
5. `src/runtime/job-runner.ts`:
   - Orchestrates the full lifecycle of a claimed job:
     1. Unpack and decrypt evidence envelope using local key and AAD context.
     2. Check fresh online permit from API.
     3. Construct system prompt containing only sanitized instructions and tool definitions.
     4. Execute bounded model loop (max 4 rounds, 120s timeout).
     5. Handle tool calls through `ToolGateway`.
     6. Assemble final structured result payload.
     7. Sign payload digest and submit to `/v1/companion/jobs/:id/complete`.
6. `src/cli.ts`:
   - Command-line interface with subcommands:
     - `pair --code <code> --name <name>`
     - `run --once` / `run --daemon`
     - `status`

---

## 3. Data Model & Tool Contracts

### 3.1 Device Identity State (`device_identity.json`)

```json
{
  "deviceId": "uuid",
  "name": "MacBook Pro",
  "fingerprint": "sha256-hex",
  "publicKey": "pem-string",
  "sessionToken": "dev_token_hash",
  "sessionExpiresAt": "iso-date"
}
```

### 3.2 Read-Only Tool Specifications

1. `get_spend_summary`:
   - Input: `{ categoryIds?: string[], startMonth?: string, endMonth?: string }`
   - Output: `{ totalSpentMinor: string, transactionCount: number, categories: { categoryId: string, amountMinor: string }[] }`
2. `get_recurring_costs`:
   - Input: `{ lookbackMonths?: number }`
   - Output: `{ recurringCount: number, monthlyTotalMinor: string, items: { description: string, intervalDays: number, estimatedAmountMinor: string }[] }`
3. `project_goal`:
   - Input: `{ targetAmountMinor: string, currentBalanceMinor: string, monthlyContributionMinor: string, annualRateBps: number }`
   - Output: `{ projectedMonths: number, targetDate: string, isFeasible: boolean }`
4. `compare_goal_scenarios`:
   - Input: `{ scenarioA: GoalScenarioInput, scenarioB: GoalScenarioInput }`
   - Output: `{ monthDifference: number, contributionDifferenceMinor: string }`

---

## 4. Failure Modes and Resilience

1. Ollama Daemon Unavailable:
   - If `127.0.0.1:11434` is unreachable or model is not loaded, the job is not claimed or is released cleanly.
2. Network Disconnect During Inference:
   - If offline when checking permit or renewing lease, runtime halts inference. The server worker maintenance recovers expired leases at due-time.
3. Mid-Inference Grant Revocation:
   - If an adult changes account grants mid-run, `checkPermit` returns `false` (`GRANT_CHANGED`). The runner aborts without leaking unconsented data.
4. Model Tool Loop Runaway:
   - Hard cap of 4 tool iterations. If exceeded, job marks as FAILED with `MAX_ROUNDS_EXCEEDED`.

---

## 5. Security & Privacy

1. Asymmetric Cryptography:
   - Private key never leaves the companion filesystem (`0600` file permissions).
   - Server only stores public keys and verifies SHA-256 signatures.
2. In-Memory Plaintext:
   - Evidence is decrypted into memory for inference and garbage-collected when the job scope exits.
   - No writing of financial payloads or transaction details to disk logs.
3. Zero Cloud Fallback:
   - Runtime rejects any API URL other than the loopback Ollama port.
4. Strict Tool Sandboxing:
   - Model cannot invoke arbitrary OS commands, network requests, or database queries.

---

## 6. Rollout & Rollback Plan

- Additive package `apps/companion` with standalone tests in `tests/companion-runtime.test.ts`.
- No breaking changes to existing web or mobile packages.
- Rollback: Revert branch commit if any issue arises.

---

## 7. Success Metrics

- 100% pass rate on companion runtime unit and protocol tests.
- Monorepo typecheck, build, lint, and formatting pass with 0 errors.
- Independent Code Review and AppSec Review approval before opening PR.
