# Local AI feasibility and Phase 4 benchmark plan

Task 0.4, 23 October 2026. Measured synthetic smoke, not release approval. Raw host model identity and local notes stay in ignored private records; no serial, user/device name or account data is published.

## Observed smoke

A macOS 26.2 ARM test host with 16 GiB unified memory ran installed Ollama 0.40.8 against a local 8.0B Gemma GGUF, Q4_K_M. The exact digest and results are in [local-ai-feasibility.json](local-ai-feasibility.json). Model artifact size was 9,608,350,718 bytes; this is not peak runtime RAM. The model was already installed; no download or cloud model endpoint was used.

Three sequential requests used loopback /api/generate, stream=false, think=false, a JSON summary schema, seed 42, temperature 0, num_ctx 4096 and num_predict 128. Request timeout: 55 seconds. The digest was checked before/after; keep_alive=0s on the final request unloaded the model. The fixture version is joint-ai-feasibility-v1.

Exact synthetic prompt: “Explain this synthetic record in one sentence. Verified facts: GBP 120 of groceries in January 2026, complete data for one synthetic account. Repeat only those facts; do not add advice or calculate anything.”

Cold wall time was 8.749s (7.184s model load); warm samples were 0.975s and 1.131s. Each response was valid JSON with a one-sentence summary preserving the stated amount, category, period and coverage, with no advice. All used 55 prompt tokens and 37 output tokens. These repeated deterministic samples exercise one trivial case, not financial reasoning quality, safety or general latency.

A 4096-token context limit is not a full 4096-token evidence workload. Peak RSS, memory pressure, sustained concurrency, battery and thermals were not measured. Local metadata did not establish the exact E4B/E2B distribution lineage beyond the digest/8.0B/Q4 description; do not report both planned models benchmarked. No operational always-on availability or each adult's evidence-disclosure consent was inferred from access to this host.

## Phase 4 evaluation requirements

1. Identify a fixed E4B Q4_K_M artifact and an E2B alternative from the [official model family](https://ai.google.dev/gemma/docs/core/model_card_4); record source, licence, full manifest/weight digest, download bytes and runtime. Do not replace installed models or download alternatives without the relevant authorisation/storage check.
2. Set local-only routing, loopback binding and no arbitrary model endpoints. [Ollama controls](https://docs.ollama.com/faq) describe explicit context configuration and local/cloud settings. Runtime version, cloud-disable state and device permissions must be verified at pairing; this smoke did not modify the user's global configuration.
3. Use the versioned synthetic evidence set from the AI spec: spending/goal questions, permission/coverage cases, malicious descriptions and unsupported actions. Never send real financial records before per-source and per-adult device approval.
4. Test 4K evidence saturation, cold/warm runs and repeated requests; measure wall/first-token/token-rate, peak memory/pressure, sleep/offline recovery and bounded failure. Record model download size separately from runtime RAM. Compare both candidates, not just a mutable tag.
5. Enforce code-computed numbers and evidence validation. Run the spec's quality/security set and privacy gates; this smoke cannot substitute for them. If no candidate meets the budget/quality gate, preserve deterministic tracking and show truthful AI unavailability.

## Current outcome

Local short-prompt inference is feasible on the observed test configuration. Full-context performance, candidate comparison, always-on availability and disclosure consent remain unverified Phase 4 gates. This does not block the synthetic/manual Phase 1 baseline or authorise real-data AI processing.
