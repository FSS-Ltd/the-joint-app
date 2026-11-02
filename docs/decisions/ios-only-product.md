# iOS-first product and delivery amendment

Date: 2 November 2026. Status: requested direction, corrected during IOS1 after IOS0 merged. The founder clarified iOS first, with Android functionality required. Filenames and IOS step IDs remain stable for existing links; implementation remains gated per PR.

## Intent and scope

Family members use one Expo React Native app on iOS and Android, with iOS prioritized for delivery. The public website houses marketing, subscription purchase/management and a separately authorized staff analytics area. A desktop household finance client and installable household PWA are outside current delivery. Android functionality is required, not a deferred platform. The existing CSV/manual, read-only scope remains: no money movement, direct bank/broker connectors or child profiles in this MVP. Keep deterministic projections, local companion, reviewed statement conversion and privacy/recovery acceptance from the existing plans.

This amendment supersedes historical web-first, iOS-only and Supabase-native instructions in the linked specifications. Existing NestJS/Postgres services and Clerk identity remain authoritative. Supabase's database hosting option does not change the identity provider. No deployment, paid service, store submission or real-data use is authorized by source delivery.

## Approach and alternatives

Use native screen families over the existing API, with shared validated DTOs, pure financial logic and semantic design tokens. Reuse React Native components within the app; share domain code across runtimes without importing Node, database, Next.js or browser modules into native bundles. Keep the existing web finance surface during migration as a regression reference, then retire it after native parity and recovery gates pass. This is the implementation choice under the user's instruction to plan and begin without another approval round.

An app-wide DOM/WebView wrapper would be quicker initially but conflicts with the requested native product and existing no-wrapper rule. A separate Swift rewrite would duplicate the TypeScript contracts and domain work. Neither is selected. Expo DOM is permitted only for a justified specialist leaf, with typed serializable data, explicit async actions and no credentials or independent authority; no such dependency is needed for the initial shell.

## Design contract

Retain forest, ivory, sage and apricot identity, approved assets, system typography and exact tabular money. Keep content surfaces rectangular with 6-point corners and actions at 8 points; reserve capsules for navigation/chips. Native navigation and standard controls take precedence over copying web chrome. Five top-level destinations: Home, Activity, Goals, Wealth and More. Accounts, imports, budgets, household and privacy live within these families. Only functional destinations enter production navigation.

Use @expo/ui for supported sheets, grouped forms, menus, toggles, sliders and pickers; wrap native UI trees in Host. Verify installed SDK/API compatibility before coding: the universal layer requires SDK 56 or later. Use universal components across iOS and Android; isolate any necessary platform-specific implementation behind typed .ios/.android component boundaries outside route files. Use React Native lists for unbounded finance data. Design for safe areas, keyboard avoidance, Dynamic Type, VoiceOver, reduced motion/transparency and sufficient contrast. Every real flow includes relevant loading, empty, stale, offline, validation, pending, error and success states. No fabricated financial values in production empty states.

## Identity, API and updates

The native app uses the maintained Clerk Expo SDK with Keychain-backed token storage and the existing server verification/session registry. Review native audience/authorized-party policy explicitly; do not weaken web validation or copy BFF cookies, CSRF assumptions, server keys or browser globals. Current membership, grants, MFA freshness, idle lock and account visibility are rechecked server-side. Clear identity-scoped data on logout, revocation, household change and background lock. Validate auth and invitation return destinations, state, expiry and replay; never put tokens in links or logs.

Extract a typed transport only when the native client needs it. Preserve integer minor-unit strings, schema validation, bounded pagination, idempotency and optimistic versions. Existing web event readers depend on DOM APIs and existing selectors cover specific job statuses; they are not a general finance subscription layer. Add authenticated native transport and narrowly scoped committed invalidations. Reconcile on startup, foreground/reconnect and invalidation; coalesce duplicate hints, cancel on unsubscribe and enforce revocation. No recurring state-discovery polling. Events carry no financial data or credentials.

## Billing boundary

Web supports hosted Stripe Checkout and the customer portal. Native may access valid web-funded household benefits, but web-only purchase steering is not assumed compliant for paid iOS digital features. Retain StoreKit/RevenueCat purchase, restore and source-specific management before public paid release. Verify applicable storefront rules at implementation and release. Do not add a general UK external-checkout link inside iOS. Exact prices, benefits, signing identity, developer account and product configuration remain launch inputs, not invented defaults.

One normalized server entitlement view covers Apple, Google and Stripe identities. Webhooks commit durable idempotent events before notification; expiry/retry work runs when due. Reconcile at startup/reconnect and on provider events; any periodic safety reconciliation must document its exceptional reason, frequency and query budget. Duplicate funding never doubles household caps; refunds, cancellation, grace, downgrade and identity conflict preserve free privacy/export access.

## Staff analytics boundary and definitions

Staff access is a separate server-authorized role, denied by default. Household membership, purchaser status, email domain and client claims never grant staff access. Recheck revocation on every request/subscription and audit access. Staff analytics receives aggregate commercial/product data, never bank balances, transaction descriptions, import contents, prompts or household financial evidence.

Initial metrics: active paid households at period end; MRR as the monthly equivalent of actual contracted recurring price after recurring discounts and excluding tax, with annual price divided by twelve; show temporary promotional discounts separately with their effective dates; refunds and net collected revenue reported separately from MRR; paying-household churn as start-of-period paid households losing paid access divided by paid households at period start; activation as first successful manual record/import after signup; user turnover as deletions during the period among the starting active registered-user cohort divided by that same cohort at period start (exclude users who joined later), separately labelled from inactivity and paid-household churn; retention as an activated signup cohort with a qualifying authenticated finance action in the measured week. Exclude fixtures, staff/test accounts and sandbox purchases. Distinguish users from households and booked revenue from cash collected. Report unknown/partial source coverage and denominator zero explicitly.

Use minimal versioned first-party lifecycle events with opaque IDs and no finance payloads. Cohort cells below five are suppressed server-side in API responses, totals and permitted filter combinations; clients never receive the underlying suppressed values. Use fixed bounded cohort windows and restrict overlapping filters/complementary totals so adjacent queries cannot reconstruct suppressed activity. Dates/granularity and retention are bounded. Detailed export, marketing attribution, third-party trackers and individual behavior drill-down are outside initial scope. The analytics unit must document actual event retention/deletion, legal basis and provider regions before production collection; source code does not establish compliance.

## Notifications, build and submission policy

Oasis reference inspected on 2 November: its mobile store-submission checklist, versioning guide and push-notification implementation plan. Reuse its explicit human submission gate, version/build distinction, contextual permissions, generic push copy and token cleanup. Those documents describe EAS/Android and a push proposal; they do not prove implemented delivery or define this app's build stack. Use their cross-platform lessons with the current Xcode/Android Studio instruction instead of EAS cloud builds. Do not copy project IDs, credentials, bundle identities, app-specific data or polling jobs. Use Expo push notifications only when a delivered flow needs remote alerts. Notifications carry opaque identifiers and generic copy, never financial amounts, merchant details, credentials or hidden-household information. Request permission in context, handle denial, encrypt device tokens at rest, exclude them from logs, bind/unbind them on identity changes and disable dead tokens from scheduled Expo receipt checks. Reauthorize every deep-link destination. Push is a delivery hint, not a substitute for authenticated event subscriptions or authority.

All build/release validation flows through CI/CD. Use Xcode for iOS native builds, signing and store submission preparation. Use Android Studio for Android native builds and submission preparation; iOS ships first and Android functionality remains required. Do not introduce EAS cloud Build/Submit as the delivery path. Simulator/bundle verification needed during development is allowed; defer signing identities, production push credentials, store metadata pipelines and submission automation until their delivery unit needs them. The founder is the final approver before review submission; no merge, green CI or automated release job submits to review on its own.

## Rollout, recovery and completion

Deliver one unit per branch and PR in the ordered plan. Independent Code Reviewer and Application Security Engineer profiles review every unit before PR creation. Fix material findings, run applicable checks, require green current-head and required integration/queue CI, then verify actual host merge before starting another unit. Standing merge authority is recorded in docs/progress.md; never bypass protections or self-approve.

Retain the old finance routes until native authentication, all current user journeys, export/deletion/archive and recovery have device evidence. Do not remove Nest endpoints while retiring Next pages. A failed native build cannot strand users without privacy/recovery access. Keep authenticated web billing account/security and required privacy/legal support routes; desktop finance navigation ends at cutover. Source PR merges remain distinct from simulator acceptance, physical-device security, store approval and deployment.

## Acceptance

- Native journeys preserve visible scope, exact money, source freshness and permission behavior from current APIs.
- Shared components remove real duplication without forcing HTML and native controls into one abstraction.
- Two-adult, cross-tenant, stale-session, revoked-grant, duplicate-event and reconnect cases pass.
- Staff revenue/retention are independently fixture-checked and cannot disclose household finance.
- Every step records files, checks, reviews, head/test-merge revision, PR and actual merge evidence in the existing progress record.
- Complete MVP and launch only after the retained financial, privacy, local-AI, statement, rehearsal, device, commercial and release gates pass.

## References checked for planning

- [Expo universal Host](https://docs.expo.dev/versions/latest/sdk/ui/universal/host/) and [SDK 56](https://expo.dev/changelog/sdk-56): verify installed API exports again in IOS1.
- [Expo Clerk guide](https://docs.expo.dev/guides/using-clerk/): native token-cache integration; repository session policy still applies.
- [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/): paid digital functionality and multiplatform access; recheck for release storefronts.
- Existing [visual contract](../design/DESIGN.md), [release scope](release-scope.md), [Phase 3](../joint-app/phases/03-wealth-and-goal-projections.md), [Phase 4](../joint-app/phases/04-local-ai-and-founder-mvp.md) and [Phase 5](../joint-app/phases/05-mobile-and-public-mvp.md).
