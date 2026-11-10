# Design Document: Physical-Device, Commercial and Release Readiness (IOS18)

## Problem Statement

With the software implementation complete across native finance (IOS4-10), subscriptions (IOS11-12), local AI companion (IOS13a-c), staff governance (IOS14-15), marketing web cutover (IOS16), local statement conversion (IOS17a), and founder monthly rehearsal (IOS17b), the project requires formal release readiness verification before submitting the native application to app stores or onboarding external households.

IOS18 establishes the release gate architecture, native build and signing validation, commercial disclosures, App Store privacy nutrition facts, offline and deep link security verification, and release rollback procedures. Under repository governance, source merges and automated pipelines must stop at this gate: final store-review submission and production deployment require explicit founder sign-off.

## Architecture Approach and Key Decisions

### Decision 1: Release Gate Audit Matrix

Create `docs/runbooks/release-readiness.md` defining the explicit gate structure:

- Physical device security (biometric storage, background snapshot masking, session revocation).
- Network resilience (offline queueing, reconnect synchronization, idempotency).
- In-App Purchase compliance (StoreKit / Google Play billing lifecycle, subscription restoration, entitlement verification).
- Statutory compliance (GDPR archive export, account deletion, UK/EU data residency).
- Founder approval gate: automated pipelines cannot submit binaries to store review.

### Decision 2: Store Privacy and Commercial Disclosures

Document App Store Privacy Nutrition Labels and store metadata reflecting only delivered features:

- Data collected: email for authentication, minimal aggregated operational telemetry (<5 threshold suppression). Zero financial amounts, transaction histories, or account balances collected by staff analytics.
- Truthful benefits: joint manual tracking, spending caps, wealth projections, local AI companion via loopback inference, and on-device statement conversion. No claims of automated bank feeds or live broker synchronization.

### Decision 3: Native Build and Signing Integrity

Enforce local reproducible build pipelines:

- iOS: `expo export --platform ios` generating static bundles for Xcode archiving without external cloud EAS dependencies.
- Android: Gradle bundle generation with hermetic asset packaging.
- Automated checks verifying zero secret keys, development endpoints, or non-production credentials embedded in bundled JavaScript.

### Decision 4: Deterministic Readiness Verification Suite

Implement `tests/release-readiness.test.ts` covering:

- App manifest and store configuration schemas.
- Deep link routing contracts for authentication, invitations, and recovery.
- Snapshot protection and secure storage abstraction invariants.
- Commercial entitlement downgrade and cancellation handling.
- Audit matrix completeness and exact unmet gate reporting.

## Data Model: Release Gate Audit Record

```ts
export interface ReleaseGateCheck {
  id: string;
  category:
    | "DEVICE_SECURITY"
    | "STORE_COMPLIANCE"
    | "PRIVACY_LEGAL"
    | "COMMERCIAL"
    | "OPERATIONS";
  name: string;
  description: string;
  status: "SATISFIED" | "BLOCKED" | "DEFERRED";
  evidenceRef: string;
  requiresFounderSignoff: boolean;
}

export interface ReleaseAuditMatrix {
  releaseVersion: string;
  targetPlatform: "IOS" | "ANDROID" | "UNIVERSAL";
  evaluatedAt: string;
  gates: ReleaseGateCheck[];
  allGatesSatisfied: boolean;
  founderSubmissionApprovalGranted: boolean;
}
```

## Failure Modes and Resilience

1. Unmet Release Gates: If any mandatory security, legal, or financial gate is unsatisfied, the readiness suite fails and flags the exact blocking item, preventing release tagging.
2. In-App Purchase Store Outage: If store receipt validation fails due to network outage, the client grants grace-period access with deterministic retry rather than immediately locking users out.
3. Rapid Rollback Trigger: If a critical regression or privacy incident is detected in production, the rollback runbook provides exact steps to withdraw the release from App Store Connect and fall back to the last known stable build.

## Security and Privacy Boundaries

- Secret Leakage Prevention: Bundled assets and application code must contain zero API secrets, database credentials, or test auth tokens.
- Background Snapshot Blur: When the application enters the background, the UI layer masks sensitive balance and transaction figures to prevent sensitive screenshots in the system task switcher.
- Device Revocation: Logging out on one device or revoking access invalidates device tokens and purges local secure storage immediately.

## Rollout and Rollback Plan

- Release Preparation:
  1. Run `tests/release-readiness.test.ts` and ensure all gate assertions pass.
  2. Verify clean iOS native bundle generation (`pnpm --filter @joint/mobile bundle:ios`).
  3. Verify web production build (`pnpm --filter @joint/web build`).
  4. Perform self-review and dispatch independent Code Reviewer and AppSec Reviewer.
  5. Merge IOS18 PR into `main`.
- Store Submission:
  - Present the completed Release Audit Matrix to the founder.
  - Obtain explicit founder authorization before uploading archives or triggering store review.

## Success Metrics

1. 100% of defined release gates evaluated with concrete evidence references.
2. Zero secret keys, non-loopback endpoints, or test tokens present in production mobile bundles.
3. Clean iOS export and full monorepo test suite execution.
4. Zero em dashes and zero banned words across all release runbooks and documentation.
