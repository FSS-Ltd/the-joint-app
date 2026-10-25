# EVENT2B — Browser status subscriptions

**Goal:** Replace recurring import, export and deletion status reads with authenticated event-driven updates, preserving approved screens and authority boundaries.

**Architecture:** A shared browser subscription controller consumes the existing empty SSE protocol through same-origin fetch. It performs serial/coalesced authoritative reads on initial/change signals, clears data on disconnect/invalidation, aborts obsolete work and reconciles after reconnect. Existing domain components own their typed data and authority scope; no event grants access.

**Tech Stack:** Existing Next.js/React/strict TypeScript, Zod contracts, browser fetch/streams and Vitest/Playwright. No new dependency.

**Spec:** AGENTS.md and BUILD.md event-driven standard; docs/design/DESIGN.md; verified merged EVENT2A PR29 and its transport plan. Original private Design/ references inspected for context; existing rectangular forest/ivory/glass composition remains.

## Global Constraints

- Base dc13725fc4843659b2887095275b9926df0c24cb. PR29 final head46f004dcc150ccde5c73e36f5776ec84190ff8c4, CI40225620656 SUCCESS, host MERGED2026-10-25T19:29:09Z reverified before branch creation.
- No deployment, tunnel, paid service, migration, auth/permission weakening or financial calculation change. Preserve ignored environment, plans, design assets and real development data.
- Only normal application status polling is removed. Local countdown timers, bounded connection deadlines/retry backoff and health checks serve different purposes.
- Keep terminal imports and ready exports subscribed for revocation/expiry. Deletion receipts remain independent of sign-in and use their existing purpose-bound cookie path.
- No financial data may remain displayed after stream invalidation, disconnection or scope change. Preserve dirty-review guards on unchanged data; changed batch versions retain existing reset semantics.
- Browser tests use synthetic fixtures and headless pinned Playwright with two workers, matching CI. Never open visible Chrome or weaken deadlines/retries.
- Implement, verify, one independent whole-branch review, PR, current-head and actual-test-merge green CI, verified host merge; no later unit before this gate.

## Review Focus

- Replaced household/account/actor scopes must cancel reads and streams; late completions cannot repopulate old data, including delayed export POST responses.
- Idle active and terminal resources must make zero recurring status reads; control events and heartbeats must not create loops.
- Disconnect, offline and BFCache restoration must clear obsolete content and reconcile before showing data again; reconnect retries must remain bounded and explicit.
- Import draft choices must survive duplicate signals for unchanged versions; authoritative version changes and revocation must clear unsafe drafts/rows.
- Completed deletion receipts must still expire, without depending on a deleted sign-in session; malformed frames must never reach domain state.

### Task 1: Shared browser status lifecycle

**Files:** apps/web/lib/status-protocol.ts (shared strict decoder); existing server module re-export; components/events/status-stream.ts (bounded fetch/reader); status-subscription.ts (resource lifecycle); status-path.ts (typed selectors); identity/client.ts (abortable requests); tests/status-subscription.test.ts and status-client-stream.test.ts.

**Interfaces:** watchStatusResource<T> accepts selector, read(AbortSignal), receive(T), unavailable(), failure(unknown); returns idempotent close. Resource reads are initial/change driven, serial and coalesced. Decoder optionally reports validated control signals while retaining its existing sanitized byte-output interface for BFF callers.

1. Write tests for missing browser modules, zero idle reads, coalesced/duplicate hints, invalidation, aborted late reads, retries, offline/restoration and cleanup. Run them: expected RED.
2. Implement bounded fetch handshake10s and inactivity45s (server keepalive15s), strict same-origin empty frames and response/status checks. Neither deadline queries state. Retry transport failures at1/2/4/8/16s, maximum5 retries; then require explicit retry. Credential renew/reconnect also clear/reconcile; repeated immediate controls cannot create a busy loop.
3. Preserve one connection/read generation. Subscribe before reading; read only after initial/change signal, never from a periodic timer. On loss abort both stream and read, clear visible data, ignore late generations. Offline waits for online; page restoration reconciles. HTTP authority failures stop without retries; malformed protocol fails safely.
4. Run focused units, strict types/lint/format. Expected GREEN. Inspect all modified modules; commit focused lifecycle.

### Task 2: Existing consumers and truthful interaction states

**Files:** imports/detail.tsx; privacy/use-export-job.ts, export-panel.tsx, deletion-status.tsx; privacy/index.tsx and archive.tsx (explicit typed export stream scope). Tests: browser/status-consumers.spec.ts, fixtures/status-signals.ts, import-workspace/privacy-workspace fixtures, real imports/privacy/status-stream browser fixtures.

**Interfaces:** Consumers supply existing read endpoints and current scope. Transient loss retains only opaque handles for retry, hiding resource data. Fatal authority errors clear handles and refresh account authority through existing callbacks. Export scope is explicit (household or archive), never guessed from untrusted URL text. Existing POST/CSRF/idempotency/permission paths remain.

1. Add browser regressions demonstrating recurring queued import/export/deletion reads and stale content after live invalidation; expected RED on current consumers.
2. Remove recurring1s/2s/5s status timers. Wire the shared watcher and abortable existing read helper; include ready/terminal resources. Preserve delayed POST scope fencing, source permission comparison, draft behavior, download authorization and receipt independence.
3. Reuse existing semantic feedback/status paragraphs and rectangular buttons for reconnect/manual retry. No CSS/layout/brand rewrite. Keep loading distinct from transient reconnect and fatal errors.
4. Presentation-only mocked fixtures provide explicit controllable synthetic SSE; real API browser fixtures enable the same production status hub. Validate committed-change UI updates, duplicates, reconnect catch-up, scope switching, expiry and abort cleanup. Inspect390/1280px renders against the approved baseline and original references; preserve keyboard/zoom/reduced-motion behavior.
5. Run focused browser acceptance with two workers plus units/types/lint/format. Expected GREEN; commit consumer conversion.

### Task 3: Full acceptance and gated delivery

**Files:** README.md and docs/progress.md; existing source/test files only for verified fixes.

1. Record PR29 merge/CI proof and EVENT2B scope in progress. Document query budgets: one initial/change authoritative read with burst coalescing, zero idle status reads; reconnect-only bounded handshake attempts. No periodic reconciliation fallback.
2. Verify exact secret-free source with frozen install, formatting, lint, all package/test types, units, database integration, two-worker browser acceptance and all builds. Inspect every changed file/diff; scan public files. Existing real local app remains available and no private fixtures enter Git.
3. Request one fresh-context independent whole-branch review of base..HEAD, including Review Focus above. Re-grade findings, resolve Important/Critical issues in one coordinated RED/GREEN correction pass and rerun affected suites. No speculative extra work or next-step implementation.
4. After local verification, publish this unit's PR; attach it. Verify latest head and actual test-merge CI, effective protections/reviews/conversations, authorised merge and exact host evidence. Refresh clean main, preserve the execution ledger and remove only this plan's own scratch. Keep the full project goal active until its requirements are actually complete.

## Recovery

Rolling back the browser code restores previous behavior without schema changes; EVENT2A's additive transport remains compatible. No queued operation is cancelled by a disconnected UI. Durable server state and existing authority fences remain authoritative; reconnect always reads current state rather than replaying sensitive events.
