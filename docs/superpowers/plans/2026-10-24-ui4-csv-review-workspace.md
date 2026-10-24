# UI4 — CSV review workspace implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. Obtain one fresh whole-branch review before PR publication; do not delegate implementation.

**Goal:** Apply the approved CSV review composition to existing upload, mapping, history, summary and source rows while preserving import safety.

**Architecture:** Keep existing account scope, upload/mapping schemas, request lifecycle, review choices and mutation controls. Extract a presentational batch summary and shared three-step indicator. Use scoped rectangular/glass surfaces, compact source rows and content-aware grids. No dependency, backend, schema or recurring-request changes.

**Tech stack:** Existing Next.js/React, strict TypeScript, plain CSS, Playwright and pinned headless Chromium.

**Spec:** [Approved visual contract](../../design/DESIGN.md) and activity-mobile/home-desktop references. The user approved applying this baseline and continuing implementation.

## Global constraints

- UI3 PR23 is verified merged at `d4f46ed59df94aa903a49b0149afe52d3d41430b`. Head `fa979ef044841be70e71cea38ca843bec80601e5` passed CI40044743226 on test merge `3a54ad789182160c23d664943249c5f21264d884`: all static/build checks,299 unit,215 integration,63 browser tests.
- Existing forest/ivory/sage/apricot tokens;6px opaque panels,8px controls,10px glass frames. Mobile first320/390px, readable800/1280px and200%zoom/reduced motion.
- Counts come directly from ImportBatchResponse. Valid includes rows that may be skipped or need a choice; never call it a committed/ready total. No invented filename, latest-bank date, automatic syncing or imported transaction claim before COMMITTED.
- Preserve mapping validation, explicit Keep/Skip, duplicate handling, rejected-row acknowledgment, dirty-choice protection, original deletion confirmation, rollback/restore permissions, version/idempotency headers and source immutability.
- Existing import-status polling remains unchanged in its separately recorded runtime conversion scope. Do not add or disguise recurring reads. No deployment/tunnel/Chrome/paid service, private source publication or development-data reset.
- Reuse the dedicated checkout and secret-free verification archive; disposable loopback fixtures only.

## Review focus

- All six batch counts remain separately labelled; rejected/duplicate/overlap counts must not imply successful commit or partition valid rows incorrectly.
- Very long descriptions/source IDs and exact int64 signed amounts wrap at320px/200% without hiding decisions or confirmation controls.
- Mapping controls remain usable in both signed and debit/credit modes; native file validation and pending/error feedback remain intact.
- Unsaved choices continue to block paging/filter changes/commit/refresh; read-only and duplicate rows offer no new write controls.
- Failed/expired/working/rolled-back/committed states preserve their original action permissions and source-retention warnings. History pagination labels loaded records honestly.

## Task 1 — Upload and batch overview

Files: modify `apps/web/components/imports/index.tsx`, `upload-form.tsx`, `mapping-fields.tsx`, `history.tsx`, `detail.tsx`; create `steps.tsx`, `batch-summary.tsx`, `imports.css`; create `tests/fixtures/import-workspace.ts`, `tests/browser/import-workspace.spec.ts`, `tests/browser/import-workspace-layout.spec.ts`.

Interfaces: `ImportSteps({stage: "inspect" | "map" | "review"})` is a semantic ordered list with one current step. `ImportBatchSummary({batch: ImportBatchResponse, dirty: boolean, refresh: () => void})` renders state, direct DTO counts, original progress/failure/expiry/commit messages and activity link. It owns no fetching or mutations.

- [x] Write failing browser regressions for labelled counts, source warnings, state-specific actions, upload/mapping stages and history paging. Use synthetic responses; verify the original UI fails new composition checks.
- [x] Implement summary/steps/layout; retain existing handlers, schemas and state/permission conditions. Show loaded history count without claiming whole inventory.
- [x] Verify focused cases pass, including real file selection, explicit mapping and keyboard operation.

## Task 2 — Review rows and readable controls

Files: modify `review-row.tsx`, `review.tsx`, `batch-actions.tsx`, scoped `imports.css`; extend browser cases.

- [x] Add regressions for rejected, stable duplicate, overlapping and normal rows; verify Keep/Skip/save, rejected acknowledgment and read-only controls remain authoritative.
- [x] Apply compact opaque rows within glass framing and explicit signed amounts. Preserve all decision/mutation props; bound controls and adapt fields to actual content width.
- [x] Inspect synthetic390/1280 renders against approved and original references. Verify320/800/200%zoom/reduced motion, long values, keyboard, empty/error and pending states.

## Task 3 — Verify and deliver

- [ ] Inspect every changed file/diff; pass formatting, lint, all strict types, all package builds/unit tests and full browser acceptance in the secret-free archive. Required CI runs full database integration for this frontend-only step.
- [ ] Obtain one independent whole-branch review; fix material findings with regressions in one pass. Scan public source for private paths/exact local secret matches.
- [ ] Commit/push/open/attach UI4 PR only after local verification. Require successful current-head/test-merge CI and actual authorised merge. Record exact evidence; no next unit or deployment before merge.
