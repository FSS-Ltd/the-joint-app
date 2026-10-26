# UI8 Solid Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace nested decorative frames with restrained glass and route existing sign-in sessions safely into the app.

**Architecture:** Keep finance markup and business behaviour. A focused auth-entry component verifies an existing session before routing. Shared surface styles own material, fallback and accessibility preferences; feature styles retain layout without decorative outer frames.

**Tech Stack:** Existing Next.js App Router, React, strict TypeScript, CSS and pinned Playwright.

**Spec:** [UI8 design](../../decisions/ui8-solid-glass.md), refining the approved [visual contract](../../design/DESIGN.md).

## Global Constraints

- Mobile first; support 320px, 390px, 1280px and 200% zoom.
- Preserve forest/ivory/sage/apricot, 6px cards, 8px controls and capsule navigation.
- Panels: 92% white with a soft highlight or 96% forest, with 16px blur; desktop canvas: 97% ivory. Solid fallback and reduced-transparency alternative.
- No new dependency, API, schema, paid service or deployment. Preserve permissions, authentication policy and session lifetimes.
- Work follows verified AUTH3 PR31 merge; this standalone step needs its own verified PR/CI/merge.

## Review Focus

- Hidden/recovering session content must remain protected; CSS must not override hidden state.
- Mobile/zoom forms and lists must retain width, readable labels and navigation clearance.
- Removing wrappers must not remove selected, rejected or destructive feedback.
- Light/dark backing, unsupported blur and reduced transparency must preserve legibility.
- Production CSS chunk order and client route navigation must retain consistent surfaces.

### Task 1: Refine the shared and feature surfaces

**Files:**

- Modify `apps/web/app/globals.css`: semantic glass tokens and support/preference fallbacks.

- Modify `apps/web/components/identity/clerk/existing-session.tsx`, `auth-form.tsx`, `use-auth-flow.ts`, `identity/use-logout.ts` and `apps/web/lib/auth-continuation.ts`: one authorized entry check, dashboard continuation, expired-session cleanup and preserved MFA/recovery/linking.
- Verify new entry behaviour in `tests/fixtures/clerk-existing-session.ts`, registered by `tests/browser/clerk-identity.spec.ts`, and the allowlist in `tests/auth-continuation.test.ts`.
- Modify `apps/web/components/navigation/navigation.css`: solid reduced-transparency alternative.
- Modify `apps/web/components/identity/identity-controls.css` and `product-shell.css`: shared material and unframed identity layout.
- Modify `apps/web/components/accounts/workspace.css`, `activity/activity.css`, `imports/imports.css`, `privacy/privacy.css`, `spending/spending.css`: remove layout-only decorative frames.
- Modify `docs/design/DESIGN.md`, `docs/decisions/design-direction.md`, `docs/progress.md`: user override and delivery evidence.
- Verify with existing `tests/browser/*workspace.spec.ts` and `visual-foundation.spec.ts`; no new declaration-mirroring tests.

**Interfaces:** consumes existing `.surface`, frame/layout classes and CSS palette tokens; produces the same public class/markup/behaviour interfaces with the revised material.

- [x] Capture baseline production renders using existing visual-foundation cases.
- [x] Remove frame-only borders/backgrounds/insets and the shared outer ring; apply one glass surface with solid and reduced-transparency fallbacks.
- [x] Inspect 390/1280 revised output; run existing family/keyboard/zoom cases and fix observed drift.
- [x] Verify revised composite contrast and fallback styling; inspect every changed file and full diff.
- [x] Run final frozen installation, formatting, lint, typecheck/test types, unit suite, builds and full browser suite with synthetic fixtures. Database integration runs in mandatory CI; no database code changes locally.
- [x] Reproduce existing-session entry failures, verify automatic authorized dashboard/explicit destination, setup/MFA/recovery, expiry, retry/no polling and preserved linking.
- [x] Commit verified implementation. Obtain one fresh whole-branch review, resolve findings with appropriate evidence, and rerun affected checks.
- [ ] Push/open PR; verify all current-head and actual test-merge CI, reviews and protections, then authorised merge and host evidence. Record final evidence before advancing.
