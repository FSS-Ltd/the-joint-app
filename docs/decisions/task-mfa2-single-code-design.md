# MFA2: Single-code native authenticator proof

**Status: implemented locally; delivery pending.** Independent review, final verification and PR CI remain required. The implementation does not authorize production configuration or deployment.

## Flow and authority

Native Clerk uses the public API `proxyUrl` in `apps/mobile/src/features/identity/provider.tsx`. `apps/api/src/modules/identity/clerk/proxy.ts` forwards to the fixed Clerk Frontend API upstream. Its transport bounds requests, responses and concurrency, applies request controls and forwards selected headers. Passwords, OTPs and client tokens transit the API; they must not enter logs or caches. The current rate limit identifies the direct peer IP and is suitable for the local development topology only. The TOTP attempt cap is process-local: 60 per minute per socket peer, with up to 2,048 peer buckets and on-demand expiry. A reverse proxy may aggregate users; distributed deployments need appropriate ingress limits and a reviewed trusted real-IP design.

`proxy-transport.ts` recognizes eligible enrollment and sign-in operations. `proxy-proof.ts` extracts only a candidate from the provider response; `proxy-capture.ts` then uses the existing `ClerkCredentialVerifier` and live provider checks to bind the candidate's exact subject and session and confirm TOTP enrollment. Enrollment additionally requires exactly one `_clerk_session_id` matching the provider candidate. The existing identity store records session TOTP proof at the original verification time. This reuses the existing access authority rather than creating a parallel authorization path. Backup codes, SMS, generic factor age and mismatched sessions do not establish TOTP proof.

A disposable loopback probe exercised one-code enrollment and backup-enabled sign-in. The embedded session JWT passed the configured preview API audience, token-use and live-provider verifier checks. A later actual-proxy/fresh-database probe reached `/me` with AAL2 after enrollment and sign-in with one code each. The final backend probe also passed; independent review remains pending.

## Enrollment lifecycle and durable operation

The additive `20261112120000_clerk_totp_operation` migration creates one short-lived operation record for eligible sign-in and enrollment. Before the network call, it records action, a hashed marker where applicable and an invalidation checkpoint; subject and session are not assumed before the provider response. A short database `SHARE` table lock establishes that checkpoint; it is released before network traffic. Completion binds verified subject, session and original time. Only minimal derived facts are stored.

An own-enrollment event can be identified before or after proof recording, with the exact proof timestamp preserved for the bound session. Unrelated events and revocations invalidate proof; late events cannot restore it and no broad grace period applies. A pending event subject is hashed. Eligibility lasts two minutes; on-demand cleanup removes at most 100 records older than five minutes and may leave idle expired records until another operation. Bound identity deletion cascades through the foreign key. Review the migration and tests for exact race and authority semantics.

A stored Svix `user.updated` payload read through the scoped Svix API contained the marker in `event_attributes.http_request.user_agent`. This was not a live-delivered, signature-verified webhook. The final probe confirmed both Svix marker flags and locally re-signed fixture delivery: the own event returned 200 and preserved AAL2; an unrelated event returned 200 and restored the AAL1 requirement. Live webhook delivery has not been verified.

## Failure, deployment and acceptance

A process crash after provider success and before durable evidence may require fresh verification. Provider, verification or persistence failure must not grant unverified access or extend the original proof time. Roll back to the existing guarded flow if the proxy or capture path cannot be relied upon. No raw marker, credential or provider body belongs in logs.

Configure and validate the server-side `CLERK_PROXY_URL` and fixed upstream before releasing a client that uses the proxy. Production configuration and deployment require separate authorization. Confirm ingress real-IP handling, rate limits, availability, SDK token rotation and provider compatibility before rollout.

Acceptance requires exact-session TOTP proof for enrollment and sign-in, negative backup/SMS and cross-session cases, live revocation and webhook races, retries and failure recovery, no secret exposure, and native verification. Relevant focused, integration and independent code/security reviews must pass on the final revision, followed by current PR CI and a verified merge. Actual iOS verification covered one-code sign-in; enrollment was verified through the actual SDK and database, not an iOS enrollment setup. Live signed-webhook acceptance remains separate from local probes.
