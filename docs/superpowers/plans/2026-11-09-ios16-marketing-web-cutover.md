# Design Document: IOS16 Marketing and Web Household Cutover

**Date:** 2026-11-09  
**Branch:** `feat/ios16-marketing-web-cutover`  
**Status:** In Progress  
**Delivery Unit:** IOS16 (`docs/superpowers/plans/2026-11-02-ios-only-delivery.md:196-203`)

---

## 1. Problem Statement

Following the strategic decision documented in `docs/decisions/ios-only-product.md` and delivered across units IOS1 through IOS15, household financial management (accounts, balances, categorized activity, spending caps, imports, wealth projections, and local companion workflows) has transitioned to the native Expo application.

The web application must now reflect this product boundary:

1. The public root (`/`) must present truthful marketing copy reflecting delivered capabilities rather than early pre-alpha placeholder notices.
2. Legacy desktop household pages (`/dashboard`, `/accounts`, `/activity`, `/budgets`, `/review`, `/imports`, `/household`) must be retired without breaking bookmarks, search indexation, or user navigation, and without exposing financial payloads in browser caches.
3. Essential web authentication, account security, MFA setup, privacy management, account recovery, household invitation acceptance, full archive exports, and account deletion workflows must be preserved and accessible.
4. Staff analytics routes (`/staff`) and administrative endpoints must remain isolated with zero public disclosure.
5. Progressive Web App (PWA) manifest and caching artifacts must be aligned with marketing and authentication boundaries rather than obsolete desktop family workspaces.

---

## 2. Architecture Approach and Core Decisions

### Decision 1: Shared Cutover Component for Retired Desktop Routes

Instead of an abrupt HTTP 404 or unconditional blind HTTP 301/302 redirects, legacy household paths (`/dashboard`, `/accounts`, `/accounts/[id]`, `/activity`, `/activity/[transactionId]`, `/activity/[id]`, `/budgets`, `/review`, `/imports`, `/imports/[batchId]`, `/imports/[id]`, `/household`) render a shared, accessible `CutoverNotice` component.

- **Rationale:** Users or bookmarked links navigating to these URLs receive a clear, authoritative explanation that active daily financial management has moved to the native iOS app. The view links to the App Store destination, security settings, privacy controls, archive export, and account deletion. Zero financial data is queried or rendered.

### Decision 2: Truthful Marketing Landing Page

The marketing root (`/`) presents delivered features accurately:

- Joint budgeting with individual category privacy.
- Spending targets and caps with real-time status.
- Wealth projections with compound growth and scenario modeling.
- Local offline AI companion with zero cloud prompt transmission.
- Privacy-first UK/EU storage, zero advertising tracking, complete portable archives, and GDPR deletion.
- Subscription options with clear pricing and terms.
- Primary calls to action: App Store download link, Sign In, Security, and Privacy.

### Decision 3: Preservation of Recovery, Privacy, and Auth Routes

Web routes necessary for account survival and compliance are preserved:

- Auth: `/sign-in`, `/sign-up`, `/sign-out`, `/recovery`, `/auth/callback`, `/auth/complete`, `/auth/task/password`.
- Security: `/security` (MFA enrollment and password management).
- Privacy & Compliance: `/settings/privacy`, `/privacy/deletion`, `/archive`.
- Household Invitation: `/join` (invitation token validation and redirect to app or onboarding).
- Staff Analytics: `/staff` (restricted to verified staff actors, verified in IOS14 and IOS15).

### Decision 4: PWA Manifest and Static Shell Realignment

- Update `manifest.ts` so `start_url` points to `/` instead of the retired `/dashboard`.
- Remove references to desktop finance tools from web manifest description.
- Ensure service worker and offline shell cache only public static assets (marketing icons, offline fallback) without caching private financial data or staff metrics.

---

## 3. Data and Route Mapping Model

### Route Inventory and Disposition Table

| Route Path                  | Status   | Disposition                           | Authority & Access          |
| :-------------------------- | :------- | :------------------------------------ | :-------------------------- |
| `/`                         | Active   | Public marketing landing page         | Public                      |
| `/sign-in`                  | Active   | Web authentication                    | Public / Clerk              |
| `/sign-up`                  | Active   | Web registration                      | Public / Clerk              |
| `/sign-out`                 | Active   | Web session revocation                | Authenticated               |
| `/recovery`                 | Active   | Emergency account recovery            | Public / Recovery token     |
| `/auth/**`                  | Active   | Clerk callbacks and password tasks    | Public / Clerk              |
| `/security`                 | Active   | MFA enrollment and session protection | Authenticated               |
| `/settings/privacy`         | Active   | Privacy choices and export management | Authenticated               |
| `/privacy/deletion`         | Active   | Statutory deletion requests           | Authenticated               |
| `/archive`                  | Active   | Full ZIP/JSON archive export download | Authenticated               |
| `/join`                     | Active   | Household invitation acceptance       | Public / Invitation token   |
| `/staff`                    | Active   | Staff revenue and retention dashboard | Staff roles only (IOS14/15) |
| `/dashboard`                | Retired  | Native cutover notice                 | Public notice / Auth prompt |
| `/accounts`                 | Retired  | Native cutover notice                 | Public notice / Auth prompt |
| `/accounts/[id]`            | Retired  | Native cutover notice                 | Public notice / Auth prompt |
| `/activity`                 | Retired  | Native cutover notice                 | Public notice / Auth prompt |
| `/activity/[transactionId]` | Retired  | Native cutover notice                 | Public notice / Auth prompt |
| `/activity/[id]`            | Retired  | Native cutover notice                 | Public notice / Auth prompt |
| `/budgets`                  | Retired  | Native cutover notice                 | Public notice / Auth prompt |
| `/review`                   | Retired  | Native cutover notice                 | Public notice / Auth prompt |
| `/imports`                  | Retired  | Native cutover notice                 | Public notice / Auth prompt |
| `/imports/[batchId]`        | Retired  | Native cutover notice                 | Public notice / Auth prompt |
| `/imports/[id]`             | Retired  | Native cutover notice                 | Public notice / Auth prompt |
| `/household`                | Retired  | Native cutover notice                 | Public notice / Auth prompt |
| `/api/**`                   | Retained | Backing BFF and Nest API proxy        | Explicit per endpoint       |

---

## 4. Failure Modes and Resilience

1. **Stale Bookmarks or Search Results:**
   - Handled gracefully by `CutoverNotice` rendering at all retired routes. Users never hit an unhandled error or opaque 404.
2. **Missing Session on Retired Routes:**
   - The cutover notice renders publicly without requiring an active session cookie, preventing authentication redirect loops for casual visitors.
3. **PWA Offline Shell Access:**
   - If a user has a previously installed PWA, the service worker serves `offline.html` or the updated marketing shell, directing them to the native app.
4. **Data Leakage in Public Caches:**
   - Retired routes execute zero financial queries. No accounts, balances, or transaction records are passed to the DOM, React tree, or headers.

---

## 5. Security and Privacy

1. **Zero Financial Payload Disclosure:**
   - Retired route handlers return purely static informational markup. No household IDs or financial summaries are fetched from NestJS or BFF endpoints.
2. **Staff Analytics Isolation:**
   - The `/staff` route remains protected by verified session tokens and active staff role validation. No staff data, endpoints, or links appear in public marketing or cutover pages.
3. **Privacy Rights Continuity:**
   - Verified data export (`/archive`), account deletion (`/privacy/deletion`), and MFA setup (`/security`) continue to function cleanly on the web.
4. **No Third-Party Trackers:**
   - The marketing page includes zero analytics scripts, advertising pixels, or third-party cookies.

---

## 6. Rollout and Rollback Plan

- **Rollout:**
  1. Author TDD test suite validating route accessibility, cutover notice presence, marketing copy, and privacy preservation.
  2. Implement `CutoverNotice` and update retired route pages.
  3. Implement marketing landing page and design craft styles in `apps/web/`.
  4. Update `manifest.ts` and verify service worker static caching.
  5. Run monorepo test, lint, typecheck, format, and bundle checks.
  6. Independent Code Review and AppSec Review.
  7. Push branch and raise PR via GitHub CLI `gh`.
  8. Merge PR following green CI checks.
- **Rollback:**
  - Standard git revert of the merge commit. All previous components remain in git history.

---

## 7. Success Metrics

1. 100% test pass rate across unit, integration, and monorepo checks.
2. All 12 retired routes render the accessible cutover notice.
3. Zero financial data or staff metrics in public page HTML or responses.
4. Essential privacy, recovery, and auth routes function without degradation.
5. Clean Next.js Turbopack web production build and clean Expo iOS bundle.
