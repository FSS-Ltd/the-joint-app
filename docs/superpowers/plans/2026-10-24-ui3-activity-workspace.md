# UI3 — Activity workspace implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. Obtain one fresh whole-branch review before PR publication; do not delegate implementation.

**Goal:** Apply the approved activity composition to the existing ledger and transaction detail without changing financial rules.

**Architecture:** Retain the current account scope, request lifecycle and mutation forms. Extract focused filters, transaction rows and source summary components. Present a compact glass-framed ledger with opaque rows and a rectangular amount-led detail panel. Manual entry follows the ledger, keeping mobile discovery and desktop reading uninterrupted.

**Tech stack:** Existing Next.js, React, strict TypeScript, CSS and Playwright. No dependency, API, schema or polling changes.

**Spec:** [Human-approved visual contract](../../design/DESIGN.md), activity-mobile and home-desktop snapshots, and the private NU.Finance/Payrix reference analysis. The user already approved applying this baseline and continuing the project.

## Global constraints

- Predecessor UI2 PR22 is host-verified merged at `b823be013722022dcc7e7433708129b47d9d2231`. Final head `1584a449371c0b11bb4f960bac5d2f8e7bc1d8de` passed CI40041522719 on test merge `1643ff0eb8d6d34c91bb21f15ebdaced8fb25929`: 299 unit, 215 integration, 53 browser and all static/build checks.
- Forest/ivory/sage/apricot tokens; 6px panels, 8px actions, 10px glass frames. Mobile first at 320/390px, readable wide layouts, 200% zoom and reduced motion.
- Keep signed exact amounts, real dates, manual/CSV provenance and reviewed/split labels. Do not sum a paginated ledger, invent freshness or imply money moved.
- Preserve owner/shared permissions, classification, correction, transfers, splits and private notes. No future routes, synthetic production content or database resets.
- Keep the local app and private settings intact. Verify in the existing secret-free archive and owned disposable runtime. No Chrome, deployment, tunnel or paid services.
- Existing runtime polling conversion and CSV review composition remain separate gated units; this step introduces no recurring reads.

## Review focus

- Extremely long descriptions and int64 signed amounts wrap at 320px/200% without hiding the transaction link or amount.
- Filters retain URL-derived values and every existing query field; collapsed filters must remain keyboard accessible and submitted values must remain active.
- More pages mean loaded records, not a complete period; a failed list must show retry and never falsely imply a new empty account.
- Shared transactions keep source/classification and private-note permissions; CSV values remain immutable.
- Empty/loading/error states stay distinguishable and no extra idle requests are introduced.

## Task 1 — Compact ledger and filter hierarchy

Files: modify `apps/web/components/activity/index.tsx`, `list.tsx` and remove their now-unused activity-only rules from `apps/web/components/finance/finance.css`; create `filters.tsx`, `row.tsx`, `activity.css`; create `tests/fixtures/activity-workspace.ts`, `tests/browser/activity-workspace.spec.ts`.

Interfaces: `ActivityFilters({filters, pending, onApply})` uses an exported `ActivityFilterValues` with the five existing fields. `ActivityRow({transaction: TransactionResponse})` keeps the single linked row, exact amount and source/review semantics. Existing ActivityList fetching, focus refresh and explicit refresh/load-more remain authoritative.

- [x] Add synthetic browser cases for compact rows, exact signed values, search/all filter submission, pagination, explicit retry, empty/shared states and no idle reads. Observe meaningful failure before production changes.
- [x] Extract filters/rows, use search plus a native advanced-filter disclosure and glass ledger frame; move the existing manual entry below the list. Retain account picker, controls and request lifecycle.
- [x] Run the focused browser tests and confirm keyboard/filter/permission boundaries.

## Task 2 — Focused transaction detail

Files: create `apps/web/components/activity/source-summary.tsx`; modify `detail.tsx`, `activity.css`; extend the browser tests.

Interface: `TransactionSourceSummary({transaction, reload})` receives the existing authoritative DTO and reload callback. The component owns presentation only; original editing forms and callbacks stay in TransactionDetail.

- [x] Add a failing layout regression for amount-led source summary at 320/390/1280px, long descriptions, extreme amounts and 200% zoom. Preserve CSV immutability/shared note boundaries in assertions.
- [x] Extract and compose the summary with source/date metadata and explicit reviewed/split state. Retain all existing forms and source warnings.
- [x] Inspect real 390/1280 renders against both references and verify focused tests.

## Task 3 — Verify and deliver

- [x] Inspect every changed file and diff; pass formatting, lint, full strict types, all builds/unit tests and full browser acceptance in the secret-free archive. CI runs full database integration for this frontend-only step.
- [x] Obtain one fresh whole-branch review; address material findings with regression evidence. Scan public source for private paths and exact local secret matches.
- [x] Commit, push, open and attach UI3 PR after local verification. Require current-head/test-merge CI, comply with reviews/protection, merge under existing authorization and record exact host evidence. No subsequent step before verified merge.
