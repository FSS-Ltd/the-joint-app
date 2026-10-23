# AUTH2 — Clerk authentication migration design

State: builder check completed; awaiting human design approval. AUTH1 is merged; this design does not claim Clerk is implemented.

## Intent and agreed scope

Replace the local GoTrue authentication path with Clerk Development while retaining the existing mobile-first sign-in, create-account, verification, recovery and security screens. Support email/password with emailed verification codes and Google. Keep AUTH1's password eye control, forest/ivory palette, rounded controls, typography and household continuation routes. Add a matching Google button and only the states required by the real provider.

The user will create/configure the Clerk instance. Keys stay in ignored local files; none were present at inspection. Webhook verification is tested with locally signed synthetic fixtures only. No tunnel, deployment, paid subscription or production approval is included. Bank connections and child profiles remain post-MVP. No unrelated finance feature starts in this step.

## Approaches and decision

Clerk custom flows are the only approach consistent with the user's explicit request to retain the current login/create-account UI. Hosted or prebuilt forms would replace those screens. Keeping GoTrue as the active provider would not implement the requested Clerk migration. Use the official browser and backend SDKs for provider operations, signature verification and webhook verification; do not implement a second password or email-code service.

Engineering proposal: retain Next.js as the same-origin backend-for-frontend (BFF), and NestJS as the final authority for internal identity and finance permissions. Clerk's authenticated browser session is resolved by the Next.js server SDK; only the BFF forwards its signed short-lived session token to the API. Finance components continue calling same-origin routes without managing provider tokens. Existing server-side CSRF, origin, no-store, schema validation and safe response handling remain in place.

## Current implementation and migration impact

Current user and session IDs are provider UUIDs. SessionStore persists encrypted GoTrue access/refresh tokens behind an opaque HttpOnly browser token. Many API controllers and database policies depend on the resulting internal UUID principal, live session registry, household membership, grant version and MFA timestamp. Clerk subjects and session IDs are strings, so directly inserting them or casting them to UUID is invalid.

Introduce an explicit identity-provider boundary and additive mappings from a configured Clerk instance/user ID to the unchanged internal User UUID, and from external session ID to internal SessionRegistry UUID. The database mapping, not email or provider metadata, establishes identity. Keep domain/service callers using the existing internal principal and authorization scope. A configured provider selects the verification path; never choose a trusted issuer from caller input. The Clerk-enabled app must not silently fall back to GoTrue when keys fail.

Retain the local provider adapter only where needed for existing verified local accounts and deterministic regression fixtures during the transition. Document which mode is active. Do not remove private local auth files, containers or legacy data as incidental cleanup. Clerk is the selected application mode once its integration is locally verified and configured.

## Identity and session rules

- Generate independent internal UUIDs for genuinely new verified Clerk users. Persist a unique instance/subject mapping. Fetch authoritative user/session state when establishing access; reject unverified primary email, blocked/deleted users, impersonation and incomplete session tasks.
- Never attach a new Clerk subject to an existing user merely because emails match. A collision must yield a safe migration-required state with existing records untouched. Preserve existing account access through an explicit server-side binding established only after fresh proof of both identities; do not invent proof or merge household data. Whether a real existing account requires binding remains an open user question. Test the collision and dual-proof path with synthetic accounts.
- Keep internal session mappings unique and persistent through revocation. A replay of the same external session cannot create a new internal session or undo household-exit, global logout or deletion revocation. Only a genuinely new authenticated provider session may register again under the applicable local user state.
- Verify signature, configured issuer, expiration, authorized origin and session-token type with the official backend SDK. Apply bounded provider requests and explicit origin allowlists. Accept no machine/API/impersonation token as a person.
- Check authoritative Clerk session status and user state on protected session resolution, since live webhooks are deliberately unreachable locally. Provider outage fails closed with safe 503; invalid/revoked credentials fail 401. Avoid holding database locks while awaiting a network operation; recheck local status under the appropriate lock before granting the principal.
- Preserve current local session expiry, recovery restrictions, household/source ownership boundaries, archived access and fresh-MFA gates. A refreshed JWT is not fresh MFA. Map signed factor-age evidence conservatively to an internal timestamp; account for minute granularity without extending the existing five-minute window. Require actual configured MFA, never email Device Trust alone, client booleans or an automatically downgraded first-factor check. Test timestamp boundaries, stale and absent second factor, and token refresh.

## User flows and UI

Use official Core 3 custom flows, not legacy method names mixed with the current SDK. Email/password signup requests the provider email code; verification advances only when Clerk completes the attempt. Show safe invalid/expired-code feedback, bounded resend cooldown, pending/disabled controls and a way to correct the email. Never display a development fixture code as a production feature.

Sign-in supports email/password and Google. Google's callback completes missing requirements, MFA and session tasks before app access. Retain the existing allowlisted household/account/archive/privacy continuation; never redirect to arbitrary query-string URLs. Include the provider-required signup challenge mount without replacing the product frame. Password recovery remains a restricted flow until provider reset and any required MFA complete. Sign-out clears app and provider state; global sign-out revokes local sessions even if the provider request later fails, with safe retry reporting.

Keep the custom authenticator enrollment/verification screen, including QR handling, pending/error states and fresh reauthentication. Do not weaken the existing MFA policy to fit a free production plan. Google, email and authenticator operations may use Clerk's hosted identity APIs; the application and financial database remain local. Actual provider delivery requires the user's development instance and does not imply deployment.

## Webhooks and deletion

Expose a dedicated unauthenticated webhook endpoint with raw-body size limits and no cookies, CSRF exemption only for that signed endpoint, and official signature/timestamp verification before parsing or writing. Reject malformed/unsigned/stale events with safe errors. Deduplicate event IDs transactionally; serialize updates per external subject/session and prevent older or repeated events from restoring deleted users or revoked sessions. If an update lacks a trustworthy ordering field, reconcile against authoritative provider state instead of applying arrival order.

Sync only required provider identity/status metadata. Do not persist full webhook payloads, personal profile details, emails, IPs or user agents in the event ledger. Never grant household membership or source rights from Clerk public metadata or organization claims. First sign-in must work before user.created arrives; webhook and just-in-time registration must converge under unique constraints. A verified user.deleted event disables authentication and revokes mapped sessions, preserving the application's established financial retention/deletion policy; it does not directly cascade-delete jointly owned records.

Adapt the existing privacy worker to delete the mapped Clerk subject through the backend SDK, with bounded calls, confirmed-not-found handling and idempotent retries. Preserve the external subject mapping/tombstone long enough to finish the existing journaled deletion after local financial purge. Restore replay must retain enough identity tombstone information to prevent webhook/JIT resurrection, while respecting existing ownership/history retention. No financial purge starts from an unsigned request or an unverified email match. Extend actual deletion/restore regressions rather than testing only mocks.

## Configuration and dependencies

Registry inspection on 2026-10-23 found @clerk/nextjs 7.9.19 and @clerk/backend 3.26.1. Their declared Node/Next/React ranges include the pinned workspace stack. Recheck exact metadata when implementation begins, pin exact versions and commit the lockfile. These dependencies are justified by the requested auth provider and official verification APIs. Add no UI library.

Provide a secret-free Clerk example and typed server/public configuration. The publishable key may enter the browser; secret and webhook keys must stay server-only. Invalid configuration names the missing/invalid setting without logging its value. Do not invent working keys, place a secret in a NEXT_PUBLIC variable, modify Vercel settings, provision services or silently send finance data to Clerk. Document instance region/data flows and what remains unverified rather than asserting compliance.

Clerk development MFA is free; production MFA needs a paid plan. The user's zero-additional-cost production target is unresolved for this vendor and must be decided before eventual production approval. No spending is authorized here.

## Acceptance and verification

1. Existing mobile/desktop auth layout and password control remain usable with keyboard and touch. Pending, invalid, expired, resend, challenge, MFA, recovery, callback and unavailable states have meaningful feedback.
2. Synthetic provider tests cover successful and rejected email/signup/login/Google callbacks; no unverified or incomplete user reaches finance. Provider errors and logs disclose no credentials or raw payloads.
3. Signed-token tests cover issuer/origin/expiry/type, subject/session substitution, revoked replay, deletion, stale MFA and local/provider outages. Existing household, grant, archive, exports, funding and privacy regressions remain green.
4. Signed local HTTP webhook fixtures cover valid create/update/delete and session revocation, signature/timestamp/body limits, duplicates, concurrency, out-of-order delivery, JIT-before-webhook and tombstone resurrection denial.
5. Actual disposable database deletion/restore tests prove mapped provider deletion retries and preserved joint/archive retention. Additive migrations upgrade populated data without rewriting existing internal IDs or granting implicit access.
6. Fresh checkout passes frozen installation, format, lint, strict types, unit, full integration, browser and all active-package builds. CI uses only disposable synthetic credentials/fixtures, with no live Clerk secrets.
7. With the user's ignored development keys, manually verify an actual delivered email code and Google round trip locally before claiming those real-provider paths work. Missing keys block that specific proof, not synthetic implementation. No tunnel or deployment.
8. One focused implementation branch/PR receives independent review after local verification, current-head/test-merge CI and authorized host-verified merge before the next project step. Record limitations and checked revisions in docs/progress.md and the PR.

## Recovery and remaining decisions

Additive mapping changes preserve legacy IDs and data. Keep the existing local preview until Clerk passes local checks and configuration is ready. Switching the explicitly configured provider back is an operational recovery option; it never reactivates locally revoked sessions or changes ownership. Do not roll back by dropping mappings or restoring a stale database without the privacy journal.

Open human input: whether existing real local account access needs migration, and the development instance configuration/keys. Production MFA budget, residency and deployment remain later approval gates. All other engineering choices above are proposals by the implementer, not invented human approvals.

## Primary references

- [Clerk email/password custom flow](https://clerk.com/docs/guides/development/custom-flows/authentication/email-password)
- [OAuth custom flow and callback](https://clerk.com/docs/guides/development/custom-flows/authentication/oauth-connections)
- [Session token claims](https://clerk.com/docs/guides/sessions/session-tokens)
- [Backend session status](https://clerk.com/docs/reference/backend/sessions/get-session)
- [MFA custom flow and production plan requirement](https://clerk.com/docs/guides/development/custom-flows/authentication/multi-factor-authentication)
- [Reverification and downgrade caveat](https://clerk.com/docs/guides/secure/reverification)
- [Webhook consistency and duplicates](https://clerk.com/docs/guides/development/webhooks/syncing)

Builder check: an independent read-only reviewer found no additional material planning questions or impossible security requirement. The two existing inputs above remain; synthetic implementation does not require live keys. No implementation approval is inferred from this review.
