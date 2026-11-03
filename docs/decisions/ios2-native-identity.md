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

## Visual fidelity correction — 3 November 2026

The founder requested closer fidelity to the accepted Stitch wireframes after
reviewing native sign-in. Follow the existing [visual contract](../design/DESIGN.md)
and local setup/home snapshots. The compact approved wordmark, restrained
sage/apricot backdrop, grouped heading and supporting copy, and one highlighted
near-opaque light panel replace the stretched logo slab and flat composition.
The later UI8 contract takes precedence over the snapshots' doubled frames.
Keep 6px panels, 8px rectangular controls, 16px gutters, scalable text and native
touch areas. Use existing native primitives and a solid material fallback;
no new dependency, replacement logo or unavailable navigation is required.

This correction remains in IOS2 / Draft PR #37. The mobile implementer owns
shared presentation components and tokens; the parent owns native inspection
and delivery evidence. Compare sign-in and recovery/signup layouts on the named
iOS runtime, verify keyboard/error/large-text reachability and full control touch
areas, run types/lint/format/units and both exports, then obtain fresh independent
Code Reviewer and Application Security Engineer checks before updating the PR.
Keep auth coordination, lifecycle and provider authority unchanged.

The founder separately approved development-only claims `aud: "familyfund-api"`
and `joint_token_use: "api-session-v1"`, preserving existing fields and stopping
on an audience conflict. This authorizes that bounded configuration and matching
private audience in the owned test API; it does not claim the settings were
applied or live acceptance passed. Visual refinement is the current priority.

## Native lifecycle and UI

Use the maintained Clerk Expo SDK and its SecureStore-backed token cache. Bundle only validated public configuration; keep all server keys out. An unconfigured build explains sign-in availability without initializing a keyless provider. Keep profile/household responses, MFA secrets and codes in memory, with pending work aborted and scoped data cleared on identity/session change, logout and background concealment.

Native state is explicit: loading, signed-out, locked (background/expired/unavailable), security-required, household-required and ready. Hydrate provider state before routing. Revalidate on startup and foreground before revealing protected content. Preserve server ten-minute inactivity with due-time expiry and genuine input activity; SDK refresh and reads never earn activity credit. No recurring session heartbeat or state-discovery polling. Treat provider failures as recoverable errors without reviving locally revoked sessions.

Preserve existing server-first logout, local/global cutoffs and cleanup-ticket recovery. Terminally rejected or missing API credentials require a separate, explicit actor-scoped local credential removal path; it must not claim server/global revocation. Retain outstanding cleanup capabilities and committed cutoffs. A rejected/expired cleanup capability is retired durably with an accurate remote-cleanup-unconfirmed notice; transient failures retain it. Use supported removal on the captured SessionResource, never broad SDK sign-out for scoped cleanup: its internal awaits can select a replacement session despite a stale supplied ID. TOTP enrollment uses SDK support; sensitive fresh proof uses the existing server endpoint and `clerk_totp` factor. Email/client trust, backup recovery and device unlock do not silently become financial TOTP proof. Native forms retain drafts on errors, disable duplicate submissions, validate boundaries and provide visible loading/error/success feedback. Native controls support scalable text and accessibility labels; password visibility and confirmation use real controls.

Household setup reuses explicit GBP/Europe-London server defaults, optional partner invitation and deliberate invitation acceptance. Wrong email, full household, stale membership and revoked session remain server-authoritative. Invitations cannot authenticate a user or imply account sharing.

Background concealment preserves only non-secret, actor/attempt-bound workflow progress: the authentication mode, attempt identifier, verification stage, resend deadline and pending authenticator-enrollment/navigation stage. Passwords, entered codes, setup secrets and identity/household responses still clear. Resuming a form never implicitly sends another code. Fence continuations after awaited SDK operations; ordinary refresh cannot force an inactive app into foreground state.

Coordinate all application session mutations across actual SDK completion, including authentication, SSO activation, cancellation and cleanup. Observe SDK resources synchronously, keep desired intent separate from loading/observed state, and block identity reads and protected display while a mutation is unsettled or quarantined. Public SDK activation is not atomically cancellable. Do not throw from a navigation callback as cancellation; allow started work to settle behind concealment. An unexpected replacement actor requires bounded settlement or explicit selection, with fresh server authority and deadline checks before reveal. A timeout cannot release an unfinished mutation to overlap another one. No private SDK patch or periodic reconciliation loop.

Verified returns use exact approved destinations, a pending-attempt lifecycle, expiry and replay rejection. SDK owns any OAuth exchange; app code never accepts an arbitrary URL's session/token. Keep auth callbacks separate from explicit invitation links. Do not add unused social/native sign-in dependencies or callbacks merely to create a return surface.

## Internal implementation sequence and ownership

1. Identity/security worker owns the narrow contracts/verifier/fixture changes and meaningful token-policy regressions. Preserve web/BFF tests; no migration. Parent reviews this seam before native integration.
2. Native runtime/UI worker owns provider setup, secure cache integration, identity-only API adapter, lifecycle/return controllers, reusable fields/feedback and thin auth/security/household routes. Keep stable coordinator interfaces and use existing schemas. Required SDK dependencies receive exact compatibility pins and documented reasons.
3. Parent integrates, inspects every changed file, verifies real native behavior where possible, then obtains independent Code Reviewer and Application Security Engineer whole-branch review before PR creation. All current-head applicable CI and actual host merge are required before IOS3.

## Verification and acceptance

Test token policy first: accepted configured API session; disabled profile; missing/wrong/malformed audience/purpose; foreign or malformed present `azp` with valid purpose; wrong signature/issuer, actor, session version, factor ages, temporal claims and provider substitution. Invalid profiles cause no provider lookup. Preserve existing web/BFF and claims-only outage logout tests.

Reuse existing credential/session/identity/household/idle/privacy integrations. Test revocation cannot re-register, global cutoff, sticky/fresh MFA, wrong adult invitation and two-household isolation. New pure native controller tests exercise zero idle requests, genuine activity, deadline expiry, immediate background concealment, foreground reconciliation, abort cleanup, stale responses after account changes, cache failures and return expiry/replay. Do not replace these with style/config snapshots or weakened deadlines.

Run frozen install, formatting, lint, root/mobile types, units, affected database integrations, both exports and Expo checks. Inspect native auth/loading/error/household flows and accessibility; distinguish synthetic tests, configured real-provider device evidence and unverified physical-device/store validation. Missing provider/device inputs cannot be represented by fabricated claims. Prepare concrete reviewable code/configuration guidance before requesting any necessary provider change. Publish a draft with exact blockers if runtime acceptance cannot yet pass; remain on IOS2 until its gate is satisfied.

## Configured runtime acceptance

Use only approved disposable development accounts and an owned isolated API/database fixture. Keep configuration in ignored private files, reuse [mobile setup](../../apps/mobile/README.md) and [Clerk setup](../joint-app/clerk-local-setup.md), and record outcomes without tokens, passwords, codes, setup keys or invitation capabilities. A public environment probe and the deliberate 503 UI probe do not satisfy these checks.

1. Verify the actual issuer session customization and matching private API audience before native admission. Preserve existing claims. If Native API is disabled, obtain the concrete configuration approval before enabling it; do not assume the environment probe proves successful authentication. Register optional OAuth returns only for actual approved identities.
2. On the named iOS simulator/device, complete signup or sign-in and verify the displayed account against the disposable account. Confirm API identity/deadline reconciliation precedes household content. A real credentials or password entry that requires human handoff must be completed by the user.
3. Open the email app during verification/recovery and return to the same attempt. Enter the code deliberately; returning must not send another code or reset the resend deadline. Open the authenticator during enrollment, return to the pending enrollment and verify it. Secrets and entered codes must clear on concealment. Verify fresh server TOTP separately from email/backup-code sign-in.
4. Create an optional disposable household using the existing defaults. Invite only another approved test adult, share the link deliberately, and accept through that adult's separately verified account. Check wrong-email/full-household responses through existing synthetic integrations; no real person needs an unsolicited message.
5. Verify background concealment and foreground reconciliation. Exercise SDK actor-change, late completion, expiry, outage and cleanup cases through the installed-SDK/source tests and disposable server integrations; record which cases also received device evidence. A masked or quarantined transition must never be reported as settled authentication.
6. Verify local/global logout using only the approved test accounts. Confirm committed server denial before ordinary credential cleanup; terminal local removal must retain its unconfirmed-server wording. A pending cleanup retry cannot resurrect revoked access. Preserve other applications, simulators and personal services.
7. Repeat supported flows on a named Android emulator/device when available, including keyboard, text scaling and TalkBack. Independently record VoiceOver, physical storage/snapshot behavior and registered cold/warm return results. Exports and Doctor cannot substitute for these runtime results.

Configured signed-session, verification, enrollment and household behavior needs current-step runtime evidence. The wider physical-device/store release matrix remains governed by IOS16; unavailable checks must be disclosed, and exports are not their proof.

Record the exact source revision, platform/runtime, configured issuer/audience match (not credential contents), disposable fixture ownership, observed result and remaining limitations in the existing progress record. Keep the PR draft while applicable native identity acceptance remains unverified; current-head CI and actual merge remain separate requirements.

## Sources

- [Clerk session tokens](https://clerk.com/docs/guides/sessions/session-tokens), [session customization](https://clerk.com/docs/guides/sessions/customize-session-tokens) and [JWT template limitations](https://clerk.com/docs/guides/sessions/jwt-templates).
- [Clerk Expo quickstart](https://clerk.com/docs/expo/getting-started/quickstart) and installed SDK source/peer metadata must be rechecked at implementation.
- Existing [iOS-first product amendment](ios-only-product.md), [delivery plan](../superpowers/plans/2026-11-02-ios-only-delivery.md) and [AUTH3 idle policy](auth3-session-inactivity.md).
