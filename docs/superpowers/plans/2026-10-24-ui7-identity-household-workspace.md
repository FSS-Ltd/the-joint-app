# UI7 — Identity and household workspace implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline, then one fresh whole-branch review.

**Goal:** Complete the approved identity/setup composition across auth, household, security and receipt states while preserving working authentication and optional invitation.

**Architecture:** Extend IdentityFrame with a scoped identity-screen/workspace class and responsive CSS; authenticated desktop screens share the existing ivory/glass workspace framing. Keep all provider/auth hooks, mutations, session changes and receipt lifecycle unchanged. Extract only the presentational household summary to keep the page focused.

**Tech Stack:** Existing Next.js App Router, React, strict TypeScript, Playwright; no dependency changes.

**Spec:** docs/design/DESIGN.md and accepted setup-mobile/home-desktop frames; private original NU.Finance/Payrix references already inspected for composition.

## Global constraints

- Mobile first:320/390/800/1280px,200%zoom, keyboard, reduced motion and safe text wrapping.
- Keep approved forest/ivory/sage/apricot,6px content panels,8px actions,10px framing and existing brand assets.
- Preserve custom login/signup/email verification/Google/MFA/recovery, continuation destinations, password visibility, provider unavailable/loading states and optional invitation.
- No auth handler, backend, schema, dependency or new recurring request. Existing event conversion remains a separate functional delivery. No deployment.
- Start only after verified PR26 merge; no next unit before this PR/current CI/actual merge.

## Review focus

- Long household names/email addresses and invitation links wrap without compressing form controls at320px or zoom.
- Authenticated desktop security/setup uses a readable workspace rather than a narrow second landing-page column.
- Email verification, password reveal and authenticator/backup-code controls remain labelled and usable by keyboard; private values remain in existing protected UI only.
- Solo adults can continue through Invite later without creating an invitation; full/member households expose no admin invitation form.
- Provider outage, invalid code and deletion receipt states retain clear feedback and real retry actions without inventing auth completion.

## Task1 — Shared identity composition

Files: modify apps/web/components/identity/frame.tsx and product-shell.css; create identity-workspace.css. Create tests/fixtures/identity-workspace.ts, tests/browser/identity-workspace.spec.ts and identity-workspace-layout.spec.ts. Reuse account-workspace identity by exporting its existing fixture value. Add scoped Clerk layout cases through an explicit registration helper imported by the existing clerk-identity.spec.ts, reusing its verified isolated provider server.

Interfaces: IdentityFrame keeps existing props/handlers, adds scoped class names only. New registerClerkWorkspaceCases(origin:string):void registers geometry checks under the existing file's setup/cleanup. New fixture returns setIdentity(MeResponse) for explicit household states; no production hooks change.

- [x] Add regressions for readable authenticated control widths, full-width desktop intro/content relationship and all identity routes at320/390/800/1280px and200%zoom. Observe baseline failures before production edits.
- [x] Apply desktop ivory/glass authenticated workspace and content-width form padding/typography; keep unauthenticated forms recognisable and preserve all controls.
- [x] Verify actual Clerk email-code/security controls at320/390/1280px using synthetic SDK resources, plus existing auth flow tests. Inspect actual390/1280 renders against approved frames.

## Task2 — Household composition

Files: modify household.tsx; create household-summary.tsx; style within identity-workspace.css. Extend new flow/geometry tests.

Interfaces: HouseholdSummary({identity:MeResponse,membership:NonNullable<MeResponse["membership"]>}):ReactNode presents existing email/role/count/currency fields. Household keeps create/logout handlers; InvitationForm keeps invitation/idempotency/clipboard handlers and Invite later link.

- [x] Add regressions for a labelled household overview, admin solo invitation and no invite POST on Invite later, full/member suppression and long text/links. Observe missing composition failure.
- [x] Extract the existing summary, arrange summary/invitation in a content-aware grid, preserve reading order and update stale local feature copy to reflect working CSV imports and unavailable direct connections.
- [x] Verify layout/keyboard/empty/error and preserved actions; inspect normal and stressed mobile/desktop renders.

## Task3 — Verify and deliver

- [x] Inspect every changed file/diff; pass format/lint/strict package and test types/all8 builds/all309 units and complete browser suite. Required CI runs215 database integration.
- [x] Obtain one independent whole-branch review; reproduce/remediate material findings in one pass. Scan public files for private paths/exact local secrets.
- [ ] Commit/push/open/attach PR only after local verification. Require successful final-head/test-merge CI, required reviews/conversations and authorised actual merge; record proof and refresh clean main. No later unit or deployment before merge.

## Remaining goal scope

Home available-amount/saving-plan/recent-activity composites, shared goal functionality, any remaining plan steps and event lifecycle conversion remain unfinished. This step does not narrow the full project goal to styling or claim the MVP finished.
