# UI2 — Account workspace implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. Do not delegate implementation; obtain one independent whole-branch review before PR publication.

**Goal:** Apply the approved account composition to the existing account list and selected-account workspace.

**Architecture:** Retain the existing account/identity hooks and server-authoritative routes. Present the collection as compact rectangular rows; show a permission-labelled overview and real actions. Add a focused account selector beside detail content on desktop and a native disclosure on mobile. Preserve existing valuation, metadata and sharing forms.

**Tech stack:** Existing pinned Next.js, React, strict TypeScript, plain CSS and Playwright. No new dependencies.

**Spec:** [Human-approved visual contract](../../design/DESIGN.md), accounts-mobile and home-desktop references in its register. The user approved applying this baseline; no new visual direction or provider capability is proposed.

## Global constraints

- Mobile first at 320/390px; 200% zoom and reduced motion; account column when actual content reaches 720px, including readable wide tablets; the existing desktop navigation rail remains from 1100px.
- Existing forest/ivory/sage/apricot tokens; 6px opaque panels, 8px actions, 10px glass framing. No capsule content cards.
- UI1 predecessor PR21 is host-verified merged at `ad856a4ab90dfefcaa32feea67b858f83b0d35ff`; CI40036868861 passes 299 unit,215 integration and 44 browser tests on head `bb3474176c711deeaf6fae8dcf11be5afd36530a`, test merge `c95ea967cc85f6c674d538be4d2f208f7ff421ba`.
- Reuse the dedicated checkout and secret-free verification archive to preserve the running local preview and ignored settings. No new worktree, deployment, tunnel, Chrome, paid service or development-data reset.
- No fabricated total: paginated account values have different dates, liabilities and adult portions. The collection overview states the loaded count and source limitations; the selected account displays its actual dated value. A future wealth screen must consume its authoritative wealth DTO rather than sum this page.
- No new polling, backend/schema changes, money movement or completed Phase3 claim. Overview composition, category caps and event-runtime conversion remain their own delivery units.

## Review focus

- Pagination must say loaded rather than imply a complete household inventory; hidden accounts and counts remain unavailable.
- Shared values-only accounts must not gain edit/import/activity controls; ownership is distinct from viewing permission.
- Missing, partial and dated manual values must stay explicit; debts must retain their sign/label and never become spendable totals.
- Long labels and large signed amounts must wrap at 320px and 200% zoom without hiding actions or selection.
- Account selection failures must not erase independently authorised detail content or leak a previous household's data.

## Task 1 — Collection and compact account rows

Files: modify `apps/web/components/accounts/list.tsx`, `card.tsx`; create `collection-overview.tsx`, `workspace.css`; add `tests/browser/account-workspace.spec.ts` and synthetic fixtures in `tests/fixtures/account-workspace.ts`.

Interface: `AccountRow({account: AccountResponse})`; compact rows use a subordinate heading, preserve exact dated amount, ownership/access and outstanding-debt labels. `CollectionOverview({count, more})` labels the loaded count, links to existing CSV import and the native add-account disclosure, and explains manual source limits. Give the creation disclosure an in-page target; do not replace its real form or MFA guard.

- [x] Write browser cases for owned/shared accounts, a debt and missing valuation. Assert exact signs, owner/access/source labels, direct import/add actions, compact row geometry and pagination wording; prove failure before production changes.
- [x] Implement overview and compact rows, retain the loading/error/empty/create flows and verify those cases pass.

## Task 2 — Selected-account workspace

Files: create `apps/web/components/accounts/account-selector.tsx`; modify `detail.tsx`, `workspace.css`; extend the browser cases.

Interface: `AccountSelector({householdId, current: AccountResponse})` uses `useAccountList`, presents loaded accessible destinations, `aria-current=page`, explicit loading/error/retry/load-more and links back to all accounts. Current detail remains authoritative. Desktop selector occupies a 200–240px column beside the value/forms; mobile uses a native disclosure before the value. Keep the scope limited to account detail, with no second column on unrelated screens.

- [x] Add a failing browser regression for selected account navigation, responsive columns and values-only permissions.
- [x] Implement selector/layout, preserving all form props and mutation callbacks; verify selection, errors and values-only controls.

## Task 3 — Verify and deliver

- [x] Inspect all changed files; run formatting, lint, package/test types, unit tests and builds in the secret-free archive.
- [x] Compare actual synthetic 390/800/1280px renders against both approved references. Check 320px, 200% zoom, reduced motion, focus, loading/error/empty, pagination and permission states; run the full browser suite with owned disposable fixtures. CI runs full database integration; no production database code changes are planned.
- [x] Obtain one fresh whole-branch review; fix material findings in one coordinated regression pass and rerun affected checks. Public scan must exclude private originals/settings/data.
- [ ] Commit, push and open UI2 PR only after local verification. Attach it, verify current head/test-merge CI and compliant merge, and record exact evidence. No next build step before actual merge.
