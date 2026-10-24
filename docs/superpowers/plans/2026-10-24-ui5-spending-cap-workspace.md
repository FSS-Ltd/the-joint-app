# UI5 — Spending and category-cap workspace implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. Obtain one fresh whole-branch review at the end; do not delegate implementation.

**Goal:** Apply the approved home/caps composition to existing spending, budgets and monthly review, with exact remaining/zero/overspend states and honest saving-impact guidance.

**Architecture:** Preserve the existing report hook, validated DTO, account/month scope, budget mutations and owner coverage controls. Add presentational cap cards and scoped content-aware layout. Use existing exact BigInt arithmetic and bounded visual ratios. No dependency, backend, migration or recurring request is introduced.

**Tech Stack:** Existing Next.js/React, strict TypeScript, CSS, Vitest, Playwright and pinned headless Chromium.

**Spec:** [Human-approved visual contract](../../design/DESIGN.md), caps-mobile/home-desktop frames and original private NU.Finance/Payrix reference images.

## Global constraints

- UI4 PR24 is host-verified MERGED at `9dcdebf0e9aff517584fabe3016345770e5e8e5c`; final head `4032cb1f17ab8430b244c54a644a7949e53e7552` passed CI40049082029 on actual test merge `71f95e71f33d0edafd52b3853928886e5a085c0c`: 299 unit, 215 integration, 79 browser and all install/static/build checks.
- Forest/ivory/sage/apricot, 6px opaque panels, 8px actions, 10px glass frames; mobile first 320/390px, readable 800/1280px and 200% zoom, keyboard and reduced motion.
- Reports remain explicit selected-month/account scopes, not a household balance. Source record date and calculation time have different meanings. Do not label net cash movement as available money, invent recent activity or a stored saving-plan target.
- Category caps use existing authorised budget/report categories, exact refund-adjusted actuals and explicit incomplete-history warnings. The server deliberately retains budget categories outside its grouped category remainder. No private-account inference or client-side reaggregation of hidden data.
- £50 cap/£32 spent means £18 left; £50 means £0 left and Limit reached; £58 means £8 over limit. Include text as well as red emphasis. No permanent pulse is needed; static warnings respect reduced motion.
- Saving impact compares category spending with that cap under an explicit assumption that other spending stays as planned. It is not a balance, transaction or additional subtraction from net cash. Month-end guidance suggests reviewing saving/investment allocation through the existing scoped review route; no transfer or investment execution is claimed.
- Preserve budget validation, optimistic versions, mutation-denial invalidation, scope changes, owner-only closed-period coverage, manual refresh and current focus/session invalidation. No new polling. Existing worker/import/export/deletion event conversion remains a separately tracked requirement.
- Reuse the dedicated checkout and secret-free verification archive. Do not modify the archive while a verification process is live. Preserve development data and real Clerk settings. No deployment, tunnel, Chrome or paid service.

## Review focus

- Zero caps, exact exhaustion, over-cap spending, refunds and amounts beyond Number precision retain exact labels and bounded chart geometry.
- Missing summary, absent budget, empty budget and incomplete history never imply a complete picture or an available saving balance.
- Shared/owner scope, revoked access, month/account transitions and pending/failed mutations preserve existing authority and clear old figures.
- Long category/account labels, many categories and extreme signed amounts remain usable at 320px/200% without covering controls or keyboard focus.
- Source freshness, category-cap comparisons and net cash are labelled distinctly; saving-impact guidance must not deduct overspend twice or imply money moved.

## Task 1 — Cap states and guidance

Files: extract exact computed GBP formatting in `packages/domain/src/cash-flow.ts`, preserving external-money validation. Modify `apps/web/components/spending/budget-presentation.ts`, `budget-chart.tsx`, `budget-editor.tsx`; create `cap-card.tsx`, `caps.css`, `tests/category-cap-presentation.test.ts`, `tests/fixtures/spending-workspace.ts`, `tests/browser/spending-workspace.spec.ts`, `tests/browser/spending-workspace-states.spec.ts`.

Interfaces: `capPosition(limit, actual)` consumes exact minor-unit strings and returns signed remaining plus state and bounded visual dimensions. `CapCard` consumes one existing budget line and its matching actual; owns no state/fetching/mutations. `BudgetChart({report, compact?})` presents saved caps, retaining the existing accessible heading; compact home shows an explicit subset and a real scoped all-caps link.

- [x] Write failing tests for £18 left, £0/limit reached, £8 over, zero caps, net refunds and exact large values. Observe failure before implementation.
- [x] Implement the smallest exact presentation helper and cap cards, with labelled rulers, static exhausted/overspend warnings and conditional saving guidance. Preserve signed actuals and original exact table.
- [x] Show cap overview before editing on budgets/review and a compact overview on home. Preserve existing forms and mutation handlers; no new collapse gate is required.
- [x] Verify focused units/browser cases including no-summary/empty/incomplete states and real scoped navigation.

## Task 2 — Report workspace composition

Files: add the missing approved `--error` token in `apps/web/app/globals.css`; verify existing rejected-import warning colour in `tests/browser/import-workspace.spec.ts`. Modify `spending/index.tsx`, `summary.tsx`, `coverage.tsx`, `spending.css`; extract `cash-bridge.tsx`, `review-actions.tsx`, `source-status.tsx` when needed to keep the screen thin. Create `tests/browser/spending-workspace-layout.spec.ts`.

- [x] Add failing regressions for explicit source date, report regions, preserved owner/shared controls, scoped navigation and readable mobile/desktop geometry. Keep native repository deadlines and retries unchanged.
- [x] Apply opaque rectangular summaries and cap cards within visible glass framing. Place report summary first, caps/related insights coherently and detailed tables/coverage/actions below. Adapt grids to actual content width.
- [x] Preserve exact category/trend tables and incomplete-month comparison rules; retain working budget editor, coverage, retry and report scope controls.
- [x] Inspect actual synthetic 390/1280px renders against approved and original references. Verify 320/800px, 200% zoom, long labels, exact amounts, reduced motion, keyboard, error/empty/pending and permission boundaries.

## Task 3 — Verify and deliver

- [x] Inspect every changed file/diff; pass formatting, lint, strict package/test types, all builds/units and complete browser acceptance in the secret-free archive. Required CI runs full database integration for this frontend-only step.
- [x] Obtain one independent whole-branch review; remediate material findings with observed regressions in one pass. Scan public source for private paths/exact local secret matches.
- [x] Commit/push/open/attach UI5 PR only after local verification. Require successful current-head/test-merge CI, repository review/conversation requirements and actual authorised merge. Record exact evidence; no next unit or deployment before merge.

## Remaining goal scope

This step does not declare the entire project or design implementation complete. Stored saving-plan targets, a permission-aware available-balance/home activity composite, future goals/wealth interactions, remaining privacy/identity refinements and outstanding event lifecycle conversion must be assessed against the full product plan after this gated delivery. Unsupported figures from sample wireframes must never be fabricated to fill those gaps.
