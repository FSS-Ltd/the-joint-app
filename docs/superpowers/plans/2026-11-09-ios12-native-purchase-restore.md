# IOS12: Native Purchase, Restore and Entitlement Recovery

## Problem Statement

The Family Fund iOS and Android mobile app needs a native in-app purchase and restore experience for the Family Fund Plus plan. UK App Store guidelines prohibit steering mobile users to web checkout for in-app digital features. The app must present native StoreKit (iOS) and Google Play Billing (Android) purchase options directly, with transparent localized pricing, annual savings, restore capability, and deep links to native subscription management. Entitlements must remain server-authoritative and bound immutably to households.

## Architecture Approach and Key Decisions

### 1. Unified Native Purchase Adapter Interface

Platform-specific purchase mechanics differ between iOS (StoreKit 2 / StoreKit) and Android (Google Play Billing), but the presentation, states, and lifecycle rules are shared.
We define `PlatformPurchaseAdapter` as a clean interface:

- `isAvailable()`: Verifies whether in-app purchases are enabled on the device (e.g. not blocked by Screen Time or parental restrictions).
- `getProducts()`: Returns localized product metadata for Plus Monthly (`the_joint_plus_monthly`) and Plus Annual (`the_joint_plus_annual`).
- `purchase(productId, householdId)`: Executes the native purchase flow and returns a discriminated union result (`success`, `pending`, `canceled`, or `error`).
- `restore(householdId)`: Queries existing store transactions and triggers entitlement recovery without double charging.
- `openManageSubscriptions()`: Opens platform native subscription management (`https://apps.apple.com/account/subscriptions` on iOS; `https://play.google.com/store/account/subscriptions` on Android).

### 2. Concrete Adapters for Apple and Google

- `ApplePurchaseAdapter`: Implements iOS StoreKit behavior. Replaces web steering with native StoreKit product display. Handles user cancellation (dismissal without errors), pending Ask-to-Buy states, and sandbox environment awareness.
- `GooglePurchaseAdapter`: Implements Android Google Play Billing behavior with matching product definitions and Play Store management URLs.
- `createPlatformPurchaseAdapter()`: Factory that selects the appropriate platform adapter based on `Platform.OS`.

### 3. Server-Authoritative Verification and Entitlements

Clients never grant entitlements locally. All native transactions are reconciled server-side via the existing normalized billing reducer and RevenueCat webhook pipeline established in IOS11:

- On purchase or restore completion, the client triggers a background sync with `GET /v1/households/:householdId/billing/subscription`.
- If verification is delayed (e.g. webhook transit delay or pending bank authorization), the client enters a graceful `verifying` state and polls with bounded retries before falling back to manual refresh.

### 4. Duplicate Funding and Identity Isolation

- If a household already possesses an active Plus subscription (via Stripe, Apple, or Google), the UI detects this state and displays current plan details with a "Manage Subscription" action rather than offering a duplicate purchase.
- If a user attempts to restore an Apple account already associated with another household, the server-authoritative state prevents subscription hijacking; the client explains that this StoreKit receipt is bound to an existing household.

### 5. Native Design and Accessibility (Design-Craft)

- Built with semantic tokens from `@/theme/tokens`.
- Minimum 48pt tap targets for all buttons and interactive controls.
- Dynamic Type support with scaling text metrics.
- High-contrast color choices adhering to WCAG 2.2 AA.
- Clear visual hierarchy: tier badge, feature list, interval toggle (Monthly vs Annual with "Save 16%" badge), clear CTA, restore link, and terms disclosure.

## Data Model

The native client consumes the contract schemas defined in `@joint/contracts`:

- `HouseholdSubscriptionResponse`: `{ subscription: SubscriptionDto | null, plan: "FREE" | "PLUS", effectiveUntil: string | null }`
- `NativeProduct`:
  - `id`: string
  - `interval`: "MONTHLY" | "ANNUAL"
  - `title`: string
  - `description`: string
  - `priceFormatted`: string (e.g. "£4.99")
  - `priceMinor`: number (e.g. 499)
  - `currencyCode`: string ("GBP")
  - `annualEquivalentMonthlyFormatted`?: string (e.g. "£4.17/mo")
  - `savingsPercentage`?: number (e.g. 16)
- `PurchaseResult`: discriminated union:
  - `{ kind: "success", transactionId: string, purchaseToken?: string }`
  - `{ kind: "pending" }`
  - `{ kind: "canceled" }`
  - `{ kind: "error", message: string }`
- `RestoreResult`: discriminated union:
  - `{ kind: "restored", transactionIds: string[] }`
  - `{ kind: "none_found" }`
  - `{ kind: "error", message: string }`

## Failure Modes and Resilience

1. User Cancels Native Flow:
   - Result: `kind: "canceled"`.
   - Behavior: Paywall remains open and visible; no error banner is displayed. User can resume or dismiss at their convenience.
2. Ask-to-Buy / Pending Transaction:
   - Result: `kind: "pending"`.
   - Behavior: Informs user that the purchase is pending family organizer or bank approval. UI updates to pending state without charging again.
3. Delayed Webhook / Verification:
   - Behavior: After purchase success, the client displays "Verifying your subscription..." and rechecks `GET /v1/households/:householdId/billing/subscription` up to 3 times with exponential backoff before offering a "Check Status" button.
4. Offline / Network Loss During Purchase:
   - Behavior: StoreKit retains the unconfirmed transaction. When the app regains connectivity, "Restore purchases" allows the user to re-submit the transaction without being charged twice.
5. In-App Purchases Disabled on Device:
   - Behavior: `isAvailable()` returns false. The UI informs the user that in-app purchases are disabled in device settings and disables purchase buttons.

## Security and Privacy

- Immutable household binding: Receipts and subscriptions belong strictly to the purchasing household.
- No client-side bypass: Client apps cannot unlock Plus features without an authoritative server entitlement response.
- No credentials or financial card details handled in client code: All card processing is delegated entirely to Apple StoreKit or Google Play Billing.
- Least privilege: Mobile API calls use existing Clerk session tokens and enforce server-side household role validation.

## Rollout and Rollback Plan

- Rollout: Delivered via branch `feat/ios12-native-purchase-restore`, verified with unit and UI component tests, reviewed by independent Code Reviewer and AppSec Reviewer subagents, and tested via CI foundation and native bundle checks.
- Rollback: Revert PR #61; server fallback defaults to Free tier with no data loss.

## Success Metrics

- 100% test pass rate for native purchase adapter and UI component tests.
- Zero TypeScript or lint errors.
- Native iOS and Android bundle exports succeed cleanly.
- CI green on PR and merged into `main`.
