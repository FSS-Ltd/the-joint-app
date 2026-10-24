# UI6 — Privacy and owner archive implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task, then obtain one fresh whole-branch review.

**Goal:** Apply the approved rectangular/glass workspace composition to privacy settings and the owner archive, preserving working permissions and confirmations.

**Architecture:** Keep existing identity, account, export and destructive-action hooks authoritative. Add presentational hierarchy around export selection and archive history; extract archive activity from the large page without changing its request lifecycle. Use content-width responsive CSS and existing components/tokens.

**Tech Stack:** Existing Next.js App Router, React, strict TypeScript, Playwright; no new dependencies.

**Spec:** docs/design/DESIGN.md and accepted wireframes; private original NU.Finance/Payrix reference compositions, inspected locally.

## Global constraints

- Mobile first; support320/390/800/1280px and200%zoom, keyboard and reduced motion.
  -6px opaque panels,8px controls,10px glass framing; existing forest/ivory/sage/apricot tokens and approved brand assets.
- Preserve export scope/permission reset, exact values, fresh MFA, destructive confirmation and owner-only archive boundaries.
- No backend, schema, dependency, paid service or deployment. No new recurring request; existing export/deletion polling conversion remains explicitly outstanding for a separate gated functional step.
- Current UI6 only; host-verified PR25 merged before branch creation. No next unit before PR/current CI/actual merge.

## Review focus

- Long account names, large signed balances and private notes remain readable without page overflow at narrow widths and zoom.
- Values-only export choices stay distinguished from transaction/history access; selection cannot survive an authority refresh.
- Leaving and deleting stay separate explicit choices, each with an unchecked required confirmation and safe cancellation.
- Archive empty/error/paginated states retain usable retry/load-more controls; selection and exact dated values never imply a total balance.
- Archive history stays read-only with no import/edit/share action, even when a current household exists.

## Task1 — Privacy workspace

Files: modify apps/web/components/privacy/index.tsx, export-panel.tsx, privacy-actions.tsx, privacy.css; extract privacy-context.tsx if needed. Create tests/fixtures/privacy-workspace.ts and tests/browser/privacy-workspace.spec.ts.

Interfaces: PrivacyContext({entitlements:EntitlementResponse|null,error:string}) presents existing plan/connection copy. ExportPanel keeps its existing typed props and useExportJob callbacks. PrivacyActions retains existing mutations and idempotency.

- [x] Add browser regressions for a named export-scope region, values-only versus history labels, selection count, explicit leave/delete confirmation cancellation, account refresh and safe unavailable state; run against UI5 and observe missing-presentation failure.
- [x] Add a glass-framed export selection with loaded/selected counts (never a total), preserve exact existing labels, and place plan/context before destructive actions in mobile reading order. Keep primary export action clear and risky actions secondary until confirmation.
- [x] Run focused cases; inspect390/1280px actual renders.

## Task2 — Owner archive

Files: modify archive.tsx; extract archive-activity.tsx with unchanged loading/request logic; extend privacy.css. Create tests/browser/privacy-workspace-layout.spec.ts and extend fixture/flow cases.

Interfaces: ArchiveActivity({account:AccountResponse}) renders selected read-only account, dated valuation and paginated TransactionResponse history. No editing callbacks. Existing ExportPanel and usePrivacyAccounts remain unchanged.

- [x] Add regressions for labelled archived account navigation/pressed selection, exact dated balance and signed history, private-note wrapping, empty/error/paging and absence of edit/import/share; observe missing workspace/geometry where applicable.
- [x] Build compact labelled account rows, read-only glass summary and compact history with exact dates/amounts. Retain legacy accessible button names, request limits and cursor behavior.
- [x] Verify320/390/800/1280px,200%zoom, large values/long labels, touch targets, keyboard selected row and reduced motion. Inspect actual390/1280px renders.

## Task3 — Verify and deliver

- [x] Inspect all changed files; pass formatting/lint/strict package and test types/all8 builds/all309 units and full browser suite. Required CI runs215 database integration.
- [x] Obtain one fresh whole-branch review; repair material findings with reproduced regressions. Scan public files for private paths and exact local secret matches.
- [x] Commit/push/open/attach UI6 PR; verify final-head/test-merge CI, required reviews/conversations and authorised actual merge. Record revisions/checks/merge, refresh clean main and preserve user data. No next step or deployment before merge.

## Remaining goal scope

Identity/setup refinements, unsupported home available-amount/saving-plan/recent-activity composites, shared goals and outstanding event lifecycle conversion remain part of the broader project. This unit does not redefine that goal as styling alone or claim the MVP complete.
