# IOS2 — Native identity and household onboarding

Date: 2 November 2026. Status: current-unit implementation design. IOS1 PR #36 is verified merged; this design implements the existing IOS2 delivery unit, not IOS3.

## Scope and reuse

Deliver iOS-first and Android-compatible Clerk signup/login, verification, password recovery, supported MFA and account tasks, secure session lifecycle and optional two-adult household onboarding. Reuse existing Nest identity/household endpoints, session registry, shared DTOs and native screen/action/text primitives. Keep routes thin and auth forms/components focused. Do not port Next hooks, cookies, CSRF state, BroadcastChannel, browser globals or web markup into native code.

No financial screens, general finance client or event transport are introduced in IOS2. The native identity adapter is limited to current identity/session/household operations. A shared helper or component is extracted only when both current consumers actually use it. No production signing, push credentials, store setup, paid service or deployment.

## API-purpose bearer profile

Native Clerk session tokens may omit `azp`. Preserve the explicit strict web session schema and every existing authorized-party, signature, issuer, temporal, provider, registry, idle, MFA and tenant check. Add a separate opt-in API-purpose session-token profile; do not make the web schema's `azp` globally optional.

The server setting `CLERK_API_BEARER_AUDIENCE` is absent by default. With a configured bounded exact audience, an origin-less session credential must contain exactly matching string `aud` and fixed signed `joint_token_use: "api-session-v1"`, in addition to all standard validated session claims. Missing, array, object or foreign audience and missing/wrong purpose are rejected explicitly. The installed SDK's audience option alone does not reject missing audience.

Cryptographic signature/issuer/time validation precedes application profile selection. Every present `azp` must pass the existing web policy; malformed, empty, null or foreign values never fall through to API admission. Keep rejection behavior without the new setting. Return only the common validated session facts needed by existing provider/registry operations. Logout's claims-only verification must accept the same valid profiles so provider outage cannot prevent local revocation.

This is API-purpose bearer admission, not native-app attestation. Static custom session claims also reach web sessions; an origin-less issuer-signed token with the exact API purpose is deliberately an API bearer credential. It grants no household, account, role or MFA rights. The web BFF still applies its existing origin/CSRF and authorized-party checks. Caller-set headers, device hints and user metadata do not select the profile or grant an exception.

## Provider configuration and rollback

Use Clerk **Sessions → Customize session token**, preserving existing custom fields and standard `sid`, `v` and factor claims. Merge an exact chosen `aud` plus `joint_token_use: "api-session-v1"`. Native calls maintained SDK `getToken()` without a JWT template. Clerk custom JWT templates are not session-bound and are unsuitable here.

No provider settings change is authorized by this design. Read actual Native API status before claiming it is missing; enabling it can bypass browser CAPTCHA and requires a concrete authorization decision if not already enabled. Actual audience, native app IDs and approved callback destinations must be verified. No invented production domains, association files, team IDs or package identities. Configure provider claims before enabling server admission. Rollback removes the server audience setting and keeps native admission fail-closed without changing the web profile.

## Native lifecycle and UI

Use the maintained Clerk Expo SDK and its SecureStore-backed token cache. Bundle only validated public configuration; keep all server keys out. An unconfigured build explains sign-in availability without initializing a keyless provider. Keep profile/household responses, MFA secrets and codes in memory, with pending work aborted and scoped data cleared on identity/session change, logout and background concealment.

Native state is explicit: loading, signed-out, locked (background/expired/unavailable), security-required, household-required and ready. Hydrate provider state before routing. Revalidate on startup and foreground before revealing protected content. Preserve server ten-minute inactivity with due-time expiry and genuine input activity; SDK refresh and reads never earn activity credit. No recurring session heartbeat or state-discovery polling. Treat provider failures as recoverable errors without reviving locally revoked sessions.

Preserve existing server-first logout, local/global cutoffs and cleanup-ticket recovery. Terminally rejected or missing API credentials require a separate, explicit actor-scoped local credential removal path; it must not claim server/global revocation. Retain outstanding cleanup capabilities and committed cutoffs. A rejected/expired cleanup capability is retired durably with an accurate remote-cleanup-unconfirmed notice; transient failures retain it. Recheck the original actor/session generation before SDK cleanup because the installed SDK can remove the sole current session despite a stale supplied ID. TOTP enrollment uses SDK support; sensitive fresh proof uses the existing server endpoint and `clerk_totp` factor. Email/client trust, backup recovery and device unlock do not silently become financial TOTP proof. Native forms retain drafts on errors, disable duplicate submissions, validate boundaries and provide visible loading/error/success feedback. Native controls support scalable text and accessibility labels; password visibility and confirmation use real controls.

Household setup reuses explicit GBP/Europe-London server defaults, optional partner invitation and deliberate invitation acceptance. Wrong email, full household, stale membership and revoked session remain server-authoritative. Invitations cannot authenticate a user or imply account sharing.

Background concealment preserves only non-secret, actor/attempt-bound workflow progress: the authentication mode, attempt identifier, verification stage, resend deadline and pending authenticator-enrollment/navigation stage. Passwords, entered codes, setup secrets and identity/household responses still clear. Resuming a form never implicitly sends another code. Fence continuations after awaited SDK operations; ordinary refresh cannot force an inactive app into foreground state.

Verified returns use exact approved destinations, a pending-attempt lifecycle, expiry and replay rejection. SDK owns any OAuth exchange; app code never accepts an arbitrary URL's session/token. Keep auth callbacks separate from explicit invitation links. Do not add unused social/native sign-in dependencies or callbacks merely to create a return surface.

## Internal implementation sequence and ownership

1. Identity/security worker owns the narrow contracts/verifier/fixture changes and meaningful token-policy regressions. Preserve web/BFF tests; no migration. Parent reviews this seam before native integration.
2. Native runtime/UI worker owns provider setup, secure cache integration, identity-only API adapter, lifecycle/return controllers, reusable fields/feedback and thin auth/security/household routes. Keep stable coordinator interfaces and use existing schemas. Required SDK dependencies receive exact compatibility pins and documented reasons.
3. Parent integrates, inspects every changed file, verifies real native behavior where possible, then obtains independent Code Reviewer and Application Security Engineer whole-branch review before PR creation. All current-head applicable CI and actual host merge are required before IOS3.

## Verification and acceptance

Test token policy first: accepted configured API session; disabled profile; missing/wrong/malformed audience/purpose; foreign or malformed present `azp` with valid purpose; wrong signature/issuer, actor, session version, factor ages, temporal claims and provider substitution. Invalid profiles cause no provider lookup. Preserve existing web/BFF and claims-only outage logout tests.

Reuse existing credential/session/identity/household/idle/privacy integrations. Test revocation cannot re-register, global cutoff, sticky/fresh MFA, wrong adult invitation and two-household isolation. New pure native controller tests exercise zero idle requests, genuine activity, deadline expiry, immediate background concealment, foreground reconciliation, abort cleanup, stale responses after account changes, cache failures and return expiry/replay. Do not replace these with style/config snapshots or weakened deadlines.

Run frozen install, formatting, lint, root/mobile types, units, affected database integrations, both exports and Expo checks. Inspect native auth/loading/error/household flows and accessibility; distinguish synthetic tests, configured real-provider device evidence and unverified physical-device/store validation. Missing provider/device inputs cannot be represented by fabricated claims. Prepare concrete reviewable code/configuration guidance before requesting any necessary provider change. Publish a draft with exact blockers if runtime acceptance cannot yet pass; remain on IOS2 until its gate is satisfied.

## Sources

- [Clerk session tokens](https://clerk.com/docs/guides/sessions/session-tokens), [session customization](https://clerk.com/docs/guides/sessions/customize-session-tokens) and [JWT template limitations](https://clerk.com/docs/guides/sessions/jwt-templates).
- [Clerk Expo quickstart](https://clerk.com/docs/expo/getting-started/quickstart) and installed SDK source/peer metadata must be rechecked at implementation.
- Existing [iOS-first product amendment](ios-only-product.md), [delivery plan](../superpowers/plans/2026-11-02-ios-only-delivery.md) and [AUTH3 idle policy](auth3-session-inactivity.md).
