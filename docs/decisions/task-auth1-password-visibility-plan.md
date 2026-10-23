# Password Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let people safely show/hide the password they enter while preserving the existing sign-in, create-account and recovery designs.

**Architecture:** One controlled password-field component owns only visibility. AuthForm retains credentials, validation, submission and pending state. Reuse current design tokens; no dependency or authentication-provider changes.

**Tech Stack:** Existing React, strict TypeScript, CSS and Playwright.

**Spec:** The Design section of this document implements the user's explicit password eye-button request. The separately requested Clerk migration remains next; this step does not complete it.

## Design

Use a compact outline eye icon inside the existing rounded input, with an eye-off state when the password is visible. Keep current label/hint/validation/autocomplete, forest/ivory colours and spacing. The local Design references inform rounded touch-friendly controls and restrained line icons; no copied branding or imagery. The existing forms' layout stays unchanged.

Start masked. A real `type="button"` toggles password/text without submitting, changing the value or writing storage. Give it an explicit Show password/Hide password name, pressed state, input association, visible keyboard focus and at least a 44px target. Labels must reference the input without nesting a second labelable control. Disable the toggle alongside the input. New or remounted fields start masked. No new network calls or telemetry.

## Global Constraints

- Preserve the running local preview and user-entered data; no deployment or tunnel.
- Preserve existing password rules and provider behavior in this standalone UI step.
- No new dependencies, secret values, automatic account links or migrations.
- Predecessor PR #18 merged at `68c03998ac782457f9392613083e973c995bda64`; final-head CI39942648547 and actual-main CI39943551326 both succeeded.
- Local verification and one independent whole-branch review precede this step's own PR; current CI and actual merge precede Clerk implementation.

## Review Focus

- Keyboard toggling must retain text and never submit the surrounding form.
- Touch-size control and long passwords must not overlap or escape at mobile widths.
- Existing hydration/pending states must not enable an inert toggle early.
- Multiple fields must have unique labels/control IDs and hide their values by default.
- Recovery must retain its existing verification/MFA boundary while reusing the password control.

### Task 1: Accessible password field

**Files:** Create `apps/web/components/identity/password-field.tsx`, modify `auth-form.tsx` and `identity-controls.css`; add `tests/browser/password-visibility.spec.ts`; allow an explicit isolated API port in `tests/browser/bootstrap.spec.ts` so full verification preserves the live preview; update `docs/progress.md`.

**Interfaces:** PasswordField consumes typed label, hint, controlled value/onChange, disabled, autocomplete and minimum length. It renders the existing maximum length 128, required input, associated hint and accessible eye button. AuthForm owns submission and keeps its current states.

- [ ] Add browser tests for masked defaults, show/hide using keyboard and pointer, value/edit preservation, no auth POST, mobile layout and recovery reuse.
- [ ] Run the new tests against the existing local form with an isolated browser context. Expected: FAIL because Show password is absent.
- [ ] Implement the focused controlled component and style; replace only the existing password markup. Expected: all targeted cases pass with unchanged auth behavior.
- [ ] Run formatting, lint, strict types, relevant unit/browser tests and all affected builds; run repository CI-required suites against fresh owned data before PR. Inspect mobile/desktop render and changed files.
- [ ] Obtain one independent review, fix material findings with regressions, publish and attach the PR, verify current-head CI and authorized actual merge. Record checked revisions and results; keep Clerk work explicitly pending.
