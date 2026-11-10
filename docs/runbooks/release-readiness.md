# Release Readiness and App Store Deployment Runbook

This runbook defines the operational verification, build procedures, store submission requirements, and rollback protocols for releasing the native mobile application.

Every step must be verified against real local evidence. Automated CI/CD pipelines cannot submit binaries to App Store Connect or Google Play Console: final store submission and public deployment require explicit founder sign-off.

## 1. Pre-Submission Readiness Gates

Before preparing a production build archive, confirm that all release gates are satisfied:

1. Physical Device Security:
   - Tokens and cryptographic keys are stored exclusively in iOS Keychain or Android EncryptedSharedPreferences.
   - App switcher background masking is active, preventing financial figures from appearing in unauthenticated multitasking snapshots.
   - Session logout immediately purges local caches and invalidates refresh tokens.
2. Network Resilience and Offline Sync:
   - When the device is offline, cached financial models remain readable.
   - Offline mutation intents are queued in local storage and reconciled idempotently upon reconnect.
3. Subscription and Commercial Lifecycle:
   - StoreKit 2 and Google Play Billing flows validate receipts securely against backend endpoints.
   - Subscriptions support restore purchases, tier upgrades, downgrades, and cancellations without data loss.
   - Free capabilities (manual tracking, spending caps, basic projections, data export, statutory deletion) remain permanently functional without subscription gates.
4. Privacy and Statutory Compliance:
   - Full JSON and CSV archive export is operational under GDPR Article 20.
   - Statutory account deletion purges user records within 30 days under GDPR Article 17.
   - App Store Privacy Nutrition Labels report only collected telemetry: authentication email and aggregated operational metrics. Zero financial amounts or transaction details are collected.

## 2. Local Native Build and Packaging

Build production bundles hermetically on local developer workstations using Xcode and Gradle without cloud build dependencies:

### iOS Production Build (Xcode)

1. Generate the static iOS bundle and asset catalog:
   ```bash
   pnpm --filter @joint/mobile bundle:ios
   ```
2. Verify that output bundle `apps/mobile/dist/ios` contains zero cleartext development secrets or local test endpoints.
3. Open `apps/mobile/ios` in Xcode:
   - Select the generic iOS device build destination.
   - Verify signing certificate and provisioning profile under target Signing & Capabilities.
   - Select Product > Archive to generate the release archive.
   - Validate archive with Xcode Organizer before distributing to TestFlight.

### Android Production Build (Gradle)

1. Export the Android static bundle:
   ```bash
   pnpm --filter @joint/mobile bundle:android
   ```
2. Open `apps/mobile/android` in Android Studio or execute:
   ```bash
   cd apps/mobile/android && ./gradlew bundleRelease
   ```
3. Verify that the output `.aab` bundle is signed with the production release keystore.

## 3. Store Listing and Marketing Disclosures

Ensure that store descriptions and metadata truthfully state delivered capabilities:

1. Joint Budgeting: Shared household tracking, customizable category caps, and month-end review attestation.
2. Wealth and Projections: Deterministic multi-year net worth forecasting with customizable contribution scenarios.
3. Local AI Companion: Private on-device conversational insights executing over loopback inference without cloud transmission.
4. On-Device Statement Conversion: Native PDF statement row extraction with summary reconciliation and CSV export.
5. Pricing Tiers: Free tier permanently available; Plus subscription at 4.99 GBP monthly or 49.99 GBP annually.
6. Transparency Statement: Explicitly state that direct automated bank connectors are planned for future phases and that current flows rely on manual entry, CSV import, and reviewed statement conversion.

## 4. Founder Sign-Off Gate

Prior to triggering store review submission:

1. Complete the Release Audit Matrix in `docs/progress.md`.
2. Confirm that all automated foundation checks, linting, and unit test suites pass clean on the release commit.
3. Present the signed archive and release notes to the founder.
4. Obtain written or recorded founder authorization:
   - Record founder approval date and target build number.
   - Automated pipelines must halt if founder approval is absent.

## 5. Phased Rollout Schedule

When releasing updates to production, apply a phased rollout to monitor crash metrics and server stability:

- Day 1: 1 percent of user base. Monitor crash rates and API latency.
- Day 2: 5 percent of user base. Verify subscription renewal webhooks.
- Day 3: 20 percent of user base. Check database connection pool health.
- Day 4: 50 percent of user base.
- Day 5: 100 percent of user base. Complete full rollout.

## 6. Emergency Rollback Procedures

If an unhandled crash or privacy regression is identified during release:

1. App Store Connect:
   - Navigate to the app version in App Store Connect.
   - Click "Pause Phased Release" immediately to prevent further user downloads.
   - If critical, release an expedited hotfix archive or request expedited review from Apple.
2. Backend Services:
   - If the regression involves API changes, deploy the previous container image tag.
   - Verify that database migrations are backward compatible before reverting API services.
3. User Communication:
   - Post an operational advisory to the public status page explaining the incident without technical jargon.
