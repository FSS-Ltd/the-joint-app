# Native Authenticator Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add local QR setup and an explicit authenticator-app handoff while preserving existing TOTP verification and privacy.

**Architecture:** Reuse one pure URI validator across web/native. Keep native setup presentation in a focused reusable component and keep provider/lifecycle coordination in the existing security screen. Encode locally with the existing qrcode version and render one SVG.

**Tech Stack:** Expo58, existing Expo UI/actions, expo-linking58.0.15, qrcode1.5.4, @types/qrcode1.5.6 and Expo-compatible react-native-svg15.16.0.

**Spec:** [IOS2.1 design](../../decisions/ios2-authenticator-setup.md).

## Global Constraints

- Current unit is IOS2.1, based on verified merged main099f3ce; no IOS3.
- Existing managed-worktree temporary bundle/package IDs remain local and must not enter the PR.
- No provider configuration, QR service, WebView, polling, store or signing-identity change.
- Keep setup secret/URI ephemeral and actor scoped; never log, persist or capture real setup data.
- Keep enrollment and fresh server verification separate.

## Review Focus

- Invalid or mismatched URI must never reach QR rendering or the OS.
- No handler or encoding failure must preserve a usable manual fallback without leaking an error payload.
- Returning from an external app must not resurrect setup material or generate another seed.
- Late completion after actor/background change must not update another screen.
- Dense/narrow QR layouts and enlarged text must remain readable, scannable and accessible.

### Task 1: One cohesive authenticator-setup delivery

**Files:**

- Create `packages/identity-runtime/src/totp-setup.ts`; export from `src/index.ts`; test in `tests/totp-setup.test.ts`.
- Modify `apps/web/components/identity/clerk/authenticator-enrollment.tsx` to consume the shared validator.
- Create `apps/mobile/src/features/identity/authenticator-enrollment.tsx`, `authenticator-qr-code.tsx` and `qr-code-path.ts`.
- Modify `apps/mobile/src/features/identity/security-screen.tsx` for atomic creation-time setup and explicit handoff.
- Modify `apps/mobile/package.json` and `pnpm-lock.yaml` for exact dependencies.
- Extend `tests/native-security-lifecycle.test.ts`; add `tests/native-authenticator-setup.test.ts` and `tests/qr-code-path.test.ts` as needed for meaningful behavior.
- Parent owns this plan/spec and progress documentation. Do not edit temporary identifiers in `apps/mobile/app.json`.

**Interfaces:**

- `getTotpSetupUri(uri: unknown, secret: unknown): string | null` returns the validated original URI. Validate length<=2048, nonempty bounded matching secret, `otpauth://totp`, a label, no userinfo/port/fragment/control characters, one secret and no duplicate/unsupported keys. Allowed optional keys: issuer, algorithm (SHA1/SHA256/SHA512), digits (6), period (30). Do not introduce a separate secret-entropy policy; provider owns factor validity.
- `createQrCodePath(value: string): { path: string; moduleCount: number } | null` uses public qrcode.create, contiguous row runs and a four-module quiet zone. It has no React Native dependency and catches encoding failure without reflecting payloads.
- Native `AuthenticatorEnrollment` consumes typed `{secret, uri}`, pending state and an explicit open callback; it reuses current text/actions and hides the selectable manual key until requested.
- Existing `useIdentityOperation` lifetime/actor fencing owns async handoff feedback. Use `Linking.openURL` only on press; catch failure with fixed manual/QR fallback text. No `canOpenURL`, app-visibility configuration or implicit verification.

- [x] Add failing regressions for valid/mismatched/hostile URI, duplicate parameters, invalid QR/manual fallback, explicit opening, open rejection and conceal/actor change.
- [x] Implement the shared helper, preserving valid existing web behavior; build the shared package and run focused tests.
- [x] Add the exact mobile dependencies, local QR SVG and accessible native setup component; preserve the existing manual key and verification controls.
- [x] Extend lifecycle tests for clearing URI/key/code, no automatic creation and late opening completion; verify focused tests and mobile/test types.
- [x] Inspect every changed file; run root checks, relevant integrations/browser coverage, exports/Doctor and native builds. Record any unavailable check honestly.
- [x] Verify the actual native presentation with non-sensitive sample data; keep any local preview entry/configuration out of the committed diff.
- [ ] Obtain independent Code Reviewer and Application Security Engineer review; resolve findings and recheck affected behavior.
- [ ] Commit only intended source/docs/dependencies, raise the focused PR, inspect latest CI/test-merge evidence, and advance only after verified merge.
