# IOS7a — Household, security, portability and privacy

**Goal:** Deliver native More/household/security/archive/privacy routes and features, including scoped CSV export with temporary file cleanup on background/logout/unmount, owner archive access (both inside an active household and after leaving a household), free privacy access after plan downgrade, leave-household and account-deletion confirmation flows, and purpose-bound deletion receipt status tracking.

**Architecture:** Extend `NativeTransport` (`apps/mobile/src/api/request.ts`) with purpose-bound `deletion-receipt` authorization (`Authorization: Deletion <statusToken>` restricted to `GET privacy/deletion-requests/:id` and `GET events?kind=deletion&id=:id`) and bounded CSV byte download (`downloadCsv`). Add `createPrivacyApi` (`apps/mobile/src/api/privacy.ts`) for household exports, archive accounts/transactions/exports, entitlements, leave-household, and account deletion. Build focused native privacy and archive views (`apps/mobile/src/features/privacy/`) reachable from `AccountScreen` (`More` tab in workspace and standalone `AccountScreen` when `me.membership === null`) and `IdentityEntry` (when a deletion receipt is active after sign-out).

---

## 1. Transport & Event Stream Extensions

1. **`apps/mobile/src/api/types.ts` & `apps/mobile/src/api/request.ts` & `apps/mobile/src/api/body.ts`:**
   - Extend `NativeRequestOptions["authorization"]` with `{ kind: "deletion-receipt"; token: string }` (validating `/^[A-Za-z0-9_-]{43}$/`, restricted strictly to `GET privacy/deletion-requests/<uuid>` and `GET events?id=<uuid>&kind=deletion`).
   - Add `readCsvBytesBody(response, lifetime)` in `apps/mobile/src/api/body.ts` enforcing `MAX_CSV_BYTES` (10 MiB) and UTF-8 validity.
   - Add `downloadCsv(path, signal)` to `NativeTransport` using `csvUploadDeadlineMs` (120s), `Accept: text/csv`, `Cache-Control: no-store`, and returning `Uint8Array<ArrayBuffer>`.
   - Extend `openStatus(selector, signal, authorization?)` on `NativeTransport` so `deletion` status streams can authenticate with `{ kind: "deletion-receipt", token }`.
2. **`apps/mobile/src/events/stream.ts`:**
   - Allow `export`, `archive-export`, and `deletion` selectors in `readNativeStatusStream` alongside existing selectors, passing optional `authorization` to `transport.openStatus`.
3. **`apps/mobile/src/api/errors.ts`:**
   - Add user-safe message for `MFA_REAUTH_REQUIRED`: `"Verify a fresh authenticator code in Account security, then try again."` and `PRIVACY_UNAVAILABLE`: `"Privacy actions are temporarily unavailable. Please try again."`

---

## 2. Typed Native Privacy API (`apps/mobile/src/api/privacy.ts`)

Create `createPrivacyApi(transport: NativeTransport)` exposing:

- **Household exports:**
  - `requestExport(householdId: string, accountIds: readonly string[], signal: AbortSignal): Promise<ExportStatus>` (`POST households/:householdId/exports`)
  - `readExportStatus(householdId: string, exportId: string, signal: AbortSignal): Promise<ExportStatus>` (`GET households/:householdId/exports/:id`)
  - `downloadExport(householdId: string, exportId: string, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>>` (`GET households/:householdId/exports/:id/download`)
- **Owner archive:**
  - `listArchiveAccounts(query: AccountListQuery, signal: AbortSignal): Promise<AccountListResponse>` (`GET me/archive/accounts?...`)
  - `readArchiveAccount(accountId: string, signal: AbortSignal): Promise<AccountResponse>` (`GET me/archive/accounts/:accountId`)
  - `listArchiveTransactions(accountId: string, query: AccountListQuery, signal: AbortSignal): Promise<TransactionListResponse>` (`GET me/archive/accounts/:accountId/transactions?...`)
  - `requestArchiveExport(accountIds: readonly string[], signal: AbortSignal): Promise<ExportStatus>` (`POST me/archive/exports`)
  - `readArchiveExportStatus(exportId: string, signal: AbortSignal): Promise<ExportStatus>` (`GET me/archive/exports/:id`)
  - `downloadArchiveExport(exportId: string, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>>` (`GET me/archive/exports/:id/download`)
- **Entitlements:**
  - `readEntitlements(householdId: string, signal: AbortSignal): Promise<EntitlementResponse>` (`GET households/:householdId/entitlements`)
- **Leave & Deletion:**
  - `leaveHousehold(householdId: string, requestId: string, signal: AbortSignal): Promise<LeaveHouseholdResponse>` (`DELETE households/:householdId/memberships/me`)
  - `requestDeletion(requestId: string, signal: AbortSignal): Promise<DeletionReceipt>` (`POST privacy/deletion-requests`)
  - `readDeletionStatus(id: string, statusToken: string, signal: AbortSignal): Promise<DeletionStatus>` (`GET privacy/deletion-requests/:id` with `authorization: { kind: "deletion-receipt", token: statusToken }`)

---

## 3. Temporary Export File & Share Helper (`apps/mobile/src/features/privacy/export-file.ts`)

- Write downloaded CSV bytes to a temporary file in `Paths.cache` (`new File(Paths.cache, "joint-export-<uuid>.csv")`).
- Track active temporary export file URIs in an in-memory registry (`ExportFileRegistry`) and delete them immediately:
  - after `Share.share` completes or throws,
  - on app backgrounding (`AppState` change !== `"active"`),
  - on route blur / unmount,
  - on actor change / logout / revocation (`workflow.conceal()` / `workflow.identify()`).
- Never delete files outside `Paths.cache.uri` and reject path traversal (`..`).

---

## 4. Native Privacy, Export, Archive & Deletion Receipt Features (`apps/mobile/src/features/privacy/`)

1. **`use-export-job.ts` & `export-panel.tsx`:**
   - Select 1–50 unique accounts (showing `Values only` vs `Values and details` access level).
   - Clear selection and in-flight/saved export handles on actor change, route blur/background, or permission/grant changes (`permissionScope` check matching web parity).
   - Track queued/processing export via `readNativeStatusStream` (`export` or `archive-export`) + status reads, with `Retry export status` when a status check fails transiently.
   - Surface `MFA_REQUIRED` / `MFA_REAUTH_REQUIRED` on request or download with a direct `Verify a fresh authenticator code` action that opens `SecurityScreen`.
   - Handle expired/revoked downloads (`404`/`410`/`403`) with clear recovery notice: `"This download is unavailable or expired, or your access changed. Refresh your accounts and request a new export."`
   - When `READY`, show expiry timestamp (`Download before ... Access is checked again when you download.`) and `Download CSV` button that downloads bytes, writes a temporary cache file, opens native `Share.share`, and cleans up the temporary file on completion/background/unmount.
2. **`archive-activity.tsx` & `archive-screen.tsx`:**
   - `ArchiveScreen` works both when `me.membership` is present (showing active household notice + link to Privacy settings) and when `me.membership === null` (after leaving a household).
   - Loads archived accounts owned by the user (`listArchiveAccounts` with `limit: 50` and `Load more accounts` pagination).
   - Selecting an archived account renders `ArchiveActivity`: read-only recorded valuation (`formatMoney`), valuation date and completeness, and paginated transactions (`Load more history`) with author-only private notes (`Your note: ...`). No edit, import, or share controls.
   - Embeds `ExportPanel` for archive exports (`me/archive/exports`, `{ kind: "archive-export" }`).
   - Clears loaded accounts, history, and export state on backgrounding or actor change.
3. **`privacy-context-card.tsx`, `privacy-actions.tsx` & `privacy-screen.tsx`:**
   - `PrivacyContextCard`: displays plan status (`Plus access` vs `Free essentials` vs `Privacy stays available`), explains that export, revoking sharing, leaving, and deleting remain free after downgrade, links to account sharing when in a household, and displays the honest `No bank connections` card (`Disconnect bank · unavailable` disabled action).
   - `PrivacyActions`:
     - Offers `Leave household` (when `me.membership` is present) and `Delete my account`.
     - Requires explicit confirmation toggle (`I understand these consequences and want to leave my household` / `delete my account`) before enabling `Confirm and leave household` / `Confirm and delete my account`, with safe `Cancel` that resets confirmation without submitting.
     - Mints a fresh `requestId` per chosen action and preserves it across retries of the same confirmed action (preventing duplicate execution on retry).
     - On `MFA_REQUIRED` / `MFA_REAUTH_REQUIRED`, preserves the confirmation state and offers `Verify a fresh authenticator code`.
     - After `leaveHousehold` succeeds, revokes local controller authority and removes the active provider session (`completeExit`), returning the user to sign-in with a notice so they can sign back in to their owner archive (or offering `Retry sign-out cleanup` if local session removal fails, without repeating the server `DELETE`).
     - After `requestDeletion` succeeds, stores the ephemeral `DeletionReceipt` in memory on `NativeWorkflow` (cleared on background or explicit dismissal), revokes local controller authority, removes the active provider session, and transitions to `DeletionReceiptScreen`.
4. **`deletion-receipt-screen.tsx`:**
   - Renders when `workflow.deletionReceipt` is present.
   - Uses `readDeletionStatus(id, statusToken)` and `readNativeStatusStream({ kind: "deletion", id })` with `Authorization: Deletion <statusToken>` to show `PENDING`, `PROVIDER_PENDING`, or `COMPLETED` status, plus `Check status again` and `Close receipt` actions.
   - Automatically clears `workflow.deletionReceipt` when the app backgrounds (`workflow.conceal()`) or when the user taps `Close receipt`.

---

## 5. Navigation & Identity Wiring

- Extend `NativeWorkflow` (`apps/mobile/src/features/identity/workflow.ts`) with view state (`view: "account" | "security" | "privacy" | "archive"`) and ephemeral `deletionReceipt: DeletionReceipt | null` (cleared on `conceal()` and `identify()` when actor changes to another non-null user, or via `clearDeletionReceipt()`).
- Update `AccountScreen` (`apps/mobile/src/features/identity/account-screen.tsx`) to offer `Privacy and data`, `Owner archive`, and `Account security` actions (both in a household on the `More` tab and when `me.membership === null` after leaving a household).
- Update `IdentityEntry` (`apps/mobile/src/features/identity/identity-entry.tsx`) so that when `workflow.deletionReceipt` is set (and not background-locked), it renders `<DeletionReceiptScreen />` even after the Clerk session transitions to `signed-out`.

---

## 6. Verification & Review Plan

1. **Unit & API tests (`tests/native-privacy-api.test.ts`):**
   - Household exports, archive accounts/transactions/exports, entitlements, leave household, deletion request, `Deletion <statusToken>` authorization header enforcement (rejected on any non-deletion path or non-GET method), bounded CSV download size/UTF-8 enforcement, and MFA error codes.
2. **Source-harness UI & lifecycle tests (`tests/native-privacy-ui.test.ts`, `tests/native-archive-ui.test.ts`):**
   - Revoked adult / permission change clears export selection and invalidates active job.
   - Expired download (`404`/`410`) and fresh-MFA required (`403 MFA_REAUTH_REQUIRED`) recovery on export request and download.
   - Temporary export CSV file creation, share sheet invocation, and guaranteed cleanup on completion, background, and logout/unmount.
   - Free essentials after downgrade from Plus (`PrivacyContextCard` & `PrivacyScreen`).
   - Canceled deletion and canceled leave-household make zero network writes; confirmed leave and confirmed deletion use stable `requestId`, transition through sign-out cleanup, and render `DeletionReceiptScreen` with `Authorization: Deletion <statusToken>` until backgrounded or dismissed.
   - Owner archive pagination, read-only transaction history with private notes, no edit/import/share actions, and archive export both with and without active household membership.
3. **Structure & Repository Checks:**
   - `tests/native-structure-guards.test.ts`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @joint/mobile bundle:ios`, `pnpm --filter @joint/mobile bundle:android`.
4. **Independent Reviews:**
   - Application Security Engineer and Code Reviewer review and sign-off before opening and merging the PR.
