# Task 1.2 — Local identity and two-adult membership

Predecessor Task 1.1 PR #8 verified merged at `99cdd9fecf528aee9d1cb92e631565fce7370f37`. Final head `09728cfda77f0d8531421d08d26653a8345edb17`, test-merge `5dcab9404cbe6dbd0da0ba9e0ee23ff8ff0a706d`, Foundation checks SUCCESS, run 39880291389. Branch: build/1.2-local-identity-membership. No Task 1.3 work may start before this step's PR/current-CI/verified-merge gate.

Everything remains local until MVP completion and explicit deployment approval. No hosted resources, previews, deployment hooks, supplier email, paid services or billing changes. Synthetic provider emails go only to a local development inbox.

## Design and boundaries

Use maintained Supabase Auth for individual verified email/password identities, password recovery and TOTP MFA. Run pinned Auth/PostgreSQL/local-inbox services on a private Docker network, publishing only loopback endpoints. Application data remains in the existing PostgreSQL container, with Prisma as its sole migration history. The Auth service owns its vendor auth-schema history in a separate database. No Data API or cloud project is needed.

Provider access/refresh tokens stay server-side, encrypted with AES-256-GCM under a locally generated, ignored key. Browser sessions use random opaque HttpOnly, SameSite cookies; no access/refresh token in browser JavaScript, localStorage or URLs. The server database serialises refresh on the session row, so multiple tabs use the same refreshed token set and stable browser cookie. Maintain a separate anonymous CSRF token; reject mutation origins and CSRF mismatches before forwarding a fixed allowlisted endpoint. Use no-store identity responses and a full navigation on logout.

Use email codes rather than implicit URL-token flows. Local mail templates contain the one-time code and no access-token redirect link. Login/verification responses only expose session status and user-safe data. Password recovery is independent of a partner. Verified TOTP is required before sensitive actions; do not present an unverified enrollment as MFA enabled.

## Implementation and verification

1. Add User status, active membership identity/role, household settings, hashed seven-day invitation and expanded SessionRegistry. Enforce one active household per user and two active adults with database constraints and locking. No finance tables or account grants in this step.
2. Build a trusted identity guard and GET /v1/me. Resolve active user, membership and session from DB after signature/provider verification. Deny disabled users, removed memberships and revoked/expired sessions immediately. Reuse the Task 1.1 boundary; never trust household or role in editable provider metadata.
3. Implement create household, invite second adult, accept invitation under verified matching email, and local/global logout. Hash both email and invitation tokens; accept in a transaction; no token replay or third adult. Do not send invitations externally: provide a one-use link for the owner to share manually.
4. Build server-owned sign-up/email confirmation, sign-in, recovery, MFA enrollment/challenge, serialized refresh and logout. Test against the actual local Auth service, not a fake production issuer. Keep ephemeral cryptographic fixtures only for focused negative tests.
5. Build mobile-first sign-in/onboarding/security/sharing screens using the established evergreen/ivory/sage/apricot design direction and actual local references. Complete pending, validation, error, empty, success and keyboard states. Inspect 390px/1280px renders, 320px overflow, zoom and reduced motion.
6. Test unauthenticated denial, email mismatch, expired/reused invite, concurrent third-adult denial, blocked user/session, stale JWT after logout, multi-tab refresh, wrong CSRF/origin, MFA enrollment/challenge and recovery. Run full formatting/lint/types/unit/integration/browser/build checks, independent review and fresh CI before authorised merge.

## Interface rulings

Task 1.1's SessionRegistry required membership; new verified users need an identity session before household creation. Make its household association nullable and resolve membership explicitly rather than fabricating a household. The minimal bootstrap route still requires active membership. Extend it through the shared guard.

The Supabase SDK is server-only. Its default browser refresh/SSR storage examples do not satisfy this project's HttpOnly policy. Use its maintained Auth client with explicit server storage and refresh ownership; do not implement password hashing, JWT minting or TOTP verification in product code. Test fixtures may generate TOTP codes to exercise the real provider.

Future native bearer-token support, finance account RLS and provider connectors remain their specified steps. Merge permission does not authorise deployment.

## State

Planning and local implementation in progress. No PR yet. No later step started.

## Implementation rulings and limits

- Ruling: use fixed explicit BFF routes instead of a catch-all proxy. This reduces the exposed forwarding surface; new routes need an explicit handler/schema.
- Ruling: new identities may have no household. Creation/acceptance binds existing active sessions to the server-resolved membership. No household is fabricated at sign-up and no editable Auth metadata supplies household authority.
- Ruling: database row locks own refresh; action savepoints preserve a successfully rotated credential set even when an action fails. Invalid provider credentials commit revocation before returning 401. Transient Auth/JWKS failures return 503 and preserve the session. Auth and application databases cannot participate in one distributed transaction; crashes after a provider-side password/MFA change require a new sign-in/recovery if local persistence cannot complete.
- Ruling: keep one verified TOTP authenticator in this MVP flow. Re-enrollment replaces abandoned unverified setup, but never silently removes a verified factor. Lost-factor support and production recovery operations remain release gates; there is no partner bypass.
- Ruling: local development Auth and inbox use loopback 15421/15424 because the standard development ports were occupied. Other local services remain untouched. Configuration supports choosing an initial Auth port before key generation.
- Ruling: local Auth owns vendor migrations in its own database; application Prisma migration history stays exclusive. The application migration backfills existing identity references without inventing verified emails or admin ownership. Existing data violating the new membership constraints makes the migration fail atomically; review/repair such data rather than deleting it automatically.
- Ruling: real browser tests use isolated local web/API ports 3301/3302 alongside the legacy bootstrap fixture on 3001. Synthetic identities are provisioned only through local test fixtures, never a product sign-in bypass.

No raw email address, password, MFA setup key, invitation token or provider token is stored in audit payloads. The necessary verified email is returned only to its authenticated owner. Invitation request replay data is encrypted and expires after 24 hours; the invitation token itself expires after seven days. Production retention/cleanup operations, account grants/RLS and financial data remain later steps.

Final outage verification reproduced SDK-owned refresh backoff making eight requests beyond the application lock budget. The provider adapter now uses one three-second deadline per ephemeral client operation and translates transport/5xx failures into a private non-retryable SDK code, then restores a safe application 503. This preserves SDK-owned Auth semantics while keeping refresh persistence under the database lock. Fake-clock HTTP/network outage tests were observed failing before the fix and passing afterward; actual Auth flows are rerun in the final gate.
