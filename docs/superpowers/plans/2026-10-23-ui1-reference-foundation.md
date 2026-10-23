# UI1 — Reference foundation implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline, task by task. Do not delegate implementation.

**Goal:** Replace the rejected menu and establish the approved visual family across existing application and identity screens.

**Architecture:** Keep the existing AccountsFrame and IdentityFrame composition boundaries. Extract one typed navigation component and focused navigation stylesheet; retain the existing route and permission logic. Apply semantic geometry tokens to existing component styles and use shared shell styling for forest framing, opaque content and desktop glass.

**Tech stack:** Existing pinned Next.js/React/TypeScript, plain CSS and Playwright. No additional dependencies.

**Spec:** [Approved visual contract](../../design/DESIGN.md), six revised wireframes and private original Design references. The user approved implementation of this baseline on 23 October 2026.

## Global constraints

- Mobile first; 320px minimum, desktop rail from 1100px, 200% zoom and reduced motion.
- Cards 6px, fields/actions 8px, glass frames at most 10px. Capsules only for navigation/chips.
- Forest/ivory/sage/apricot palette; opaque financial text surfaces, glass framing with solid fallback.
- Existing functionality, permissions, financial semantics, keyboard access and local data remain intact.
- No fabricated financial data or future navigation destinations; no deployment, tunnel, paid service or Chrome.
- No polling or backend/schema changes. Existing polling conversion remains a separate unit.
- AUTH2 predecessor PR20 is host-verified merged at `de6c38e8b86983ed6d3808cdf613a4cbe5031809`; checked head `f2c90a4bb3dd2b3405d82e40f0c21ca802cc711b` passed CI40030313769, test-merge prefix `b4dfb57`, 299 unit/215 integration/36 browser tests. The user confirms all three live authentication paths complete.

## Review focus

- Narrow screens and zoom must not turn the menu into a grid of cramped links or obscure focused content.
- Every existing destination remains keyboard reachable; secondary-page selection remains visible through More.
- Month/account report query remains intact across report destinations without being added to unrelated routes.
- Auth, permission-error, empty, loading and populated states retain readable opaque panels and working controls.
- Brand assets, chart meanings, privacy labels and amount semantics survive the restyle; decorative glass must not reduce text contrast.

## Task 1 — Responsive navigation

Files: create `apps/web/components/navigation/app-navigation.tsx`, `navigation-icon.tsx`, `navigation.css`; modify `apps/web/components/accounts/frame.tsx` and `accounts.css`; test `tests/browser/visual-foundation.spec.ts`.

Interface: `AppNavigation({active, reportQuery})`, with a typed union of existing destinations. One App navigation landmark; desktop vertical rail and mobile four direct links plus native More disclosure. Report queries apply only to Home/Budgets/Review. Mobile More includes Review, Imports, Household, Security, Privacy and Archive; no fake Goals/Wealth links. Icons are decorative inline SVGs beside visible text.

- [x] Write and run a failing browser regression proving mobile More keyboard access, selected state and report-scope preservation.
- [x] Extract navigation, remove obsolete menu rules, and run the regression to green.

## Task 2 — Shared visual foundation

Files: modify global tokens, identity layout/controls, account/finance/spending styles, imports selected state, public introduction and generic offline document where required. Add focused shell styling rather than a global override dump.

- [x] Add browser assertions for 320/390/1280px geometry, overflow, focus, 200% zoom and reduced motion on existing route families.
- [x] Apply approved forest shell, static sage/apricot backdrop, rectangular opaque content and visible glass framing on both platforms. Preserve labels and controls.
- [x] Visually compare actual mobile/desktop synthetic renders with the approved snapshots; fix deviations before delivery. Screen-specific feature composition remains later work; this unit must deliver the real common shell on every existing frame.

## Task 3 — Verify and deliver UI1

- [x] Inspect every changed file; run formatting, lint, strict package/test-source types, unit tests and all package builds.
- [x] Run full browser acceptance with disposable synthetic data; preserve private environment files, journal and development database. Run database integration only if backend behavior changes or failures justify it; CI runs the full required suite regardless.
- [ ] Obtain one independent whole-branch review, remediate material findings, rerun affected checks, and raise UI1 PR after local verification.
- [ ] Verify latest-head/test-merge CI, repository reviews/conversations and authorized merge. Record exact revisions/results in progress and PR. Do not begin UI2 before host-verified merge.

## Execution record

UI1 baseline approval received. AUTH2 gate is complete. Shared navigation and visual foundation are implemented, including the authenticated household/security frames. Local geometry and focus regressions were reproduced and corrected; final verification and independent review precede PR publication. UI1 is not complete until host-verified merge.
