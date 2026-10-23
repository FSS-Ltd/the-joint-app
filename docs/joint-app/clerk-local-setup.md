# Clerk development authentication

AUTH2 keeps the existing mobile-first sign-in/create-account design, password visibility control and household permissions. The visible product name is **The Family Fund App**; the repository remains `the-joint-app`.

## Prepare local settings

Use the existing selected Clerk **Development** application. Enable email/password, email-code verification, Google and authenticator-app MFA in its Dashboard. Keep recovery codes available. Do not provision another application through SDK keyless mode or run a scaffolding command over this repository.

1. Put `CLERK_SECRET_KEY` (`sk_test_…`) and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_test_…`) in ignored root `.env`. Never paste keys into chat, source or a PR.
2. Run `pnpm auth:clerk:setup`. This validates the development keys, derives the issuer and RSA public key, preserves existing identity encryption/hash keys and creates supplemental ignored `.env.clerk` with mode `0600`. A fresh setup fetches only the instance's public JWKS. Existing signing keys are preserved; rotation needs an explicit public-key update and verification.
3. Preserve `.env.auth` when migrating existing local accounts. Its `AUTH_TOKEN_KEY` and `AUTH_EMAIL_HASH_KEY` must not change. The legacy provider remains available only for the explicit linking proof and old-identity cleanup; ordinary Clerk-mode login never falls back to it.
4. Start Docker, run `pnpm db:up`, then `pnpm db:migrate`. Migrations are additive. Never reset development storage or discard the independent privacy journal.
5. Run `pnpm dev`, or start `@joint/web`, `@joint/api` and `@joint/worker` independently with their `dev` scripts. Web/API use ports `3000`/`3001`. The existing local PostgreSQL port override remains valid.

Dev/start scripts load root `.env`, then relevant private service settings, then `.env.clerk`. Explicit process environment values take precedence. Builds require no real Clerk keys. Tests use synthetic identities and disposable databases; do not load real `.env.clerk` into synthetic-provider tests.

Missing/invalid configuration fails with safe field names or an actionable setup state. It does not expose values or create a replacement instance. The API validates signature, issuer, authorized origin, session/user status and expiry; provider outages deny access safely. Tokens, passwords and verification codes are never stored in browser local storage or returned by the first-party API.

## Existing-account linking

A verified email match does **not** link accounts. An operator-assisted local migration requires both independently verified sessions on the same browser and fresh authenticator proof for both accounts:

1. Sign in to the Clerk account and enable its authenticator at `/security` if needed. A collision at `/auth/complete` offers the linking form.
2. Temporarily start the local preview with explicit `AUTH_PROVIDER=local` and sign in to the existing account, completing a fresh authenticator check. Keep the same browser/origin. Do not clear its HttpOnly `joint-session` cookie.
3. Return the preview to `AUTH_PROVIDER=clerk` within five minutes. At `/auth/complete`, enter a fresh code from the **Clerk account's** authenticator. The server verifies the live legacy session and both fresh proofs, then binds to the original internal user UUID. Existing household, ownership, grants and records remain attached to that UUID.
4. Success removes the legacy browser cookie. Missing, expired, revoked, mismatched or deleted identities fail closed. Repeat the relevant sign-in/check if its proof expires. No password hash migration or email-only linking is supported.

`POST /api/auth/link-legacy` uses same-origin/CSRF protection and two separate server-only credentials. Callers cannot supply a user UUID as authority. The corresponding API route is `POST /v1/auth/link-legacy`.

## Webhooks and verification email

The local handler is `http://127.0.0.1:3001/v1/webhooks/clerk`. **Clerk's hosted service cannot deliver to localhost.** Leave the Dashboard endpoint unset while the project remains local. No tunnel or deployment is authorized. See [signed local fixtures](clerk-webhooks-local.md) for subscriptions and configuration.

Verification email and Google sign-in use Clerk's browser authentication flow; they do not depend on webhook delivery. Live receipt of a code and completed Google authorization still require a real development-account round trip. Synthetic checks do not prove email deliverability or a successful Google callback.

## Deletion and restore

A verified deletion intent records only internal UUIDs and, for Clerk accounts, the external issuer/subject identifiers. The actor lock serializes this durable journal snapshot with identity linking and revocation. Local purge happens before provider deletion. Provider failure leaves the request pending for retry; only confirmed deletion/absence completes it. Legacy local identities are reconciled separately when their worker settings exist.

Preserve `.local/privacy/deletion-ledger.ndjson` independently of database backups. Mapping/session tombstones survive financial purge. Replay into an older backup restores terminal external-user tombstones even when that backup predates identity linking. Access stays closed until provider reconciliation succeeds. A local-only restore adapter refuses Clerk intents; production restore tooling must explicitly support the provider. The automated Clerk restore proof uses an owned disposable PostgreSQL target and a synthetic provider, never the live development application.

## Data flow and release limits

Clerk handles email, passwords, authenticator secrets and Google authentication. The application receives a verified email for its existing hash and minimal identity/session state. Financial records and household/source permissions stay in the application's database; Clerk organizations and profile metadata do not grant access. Webhooks store minimal identifiers/state/digests, not raw payloads or profile details.

Actual vendor data region, retention/deletion commitments and Google consent configuration still need review before production. This repository does not claim UK/EU residency or compliance from selecting Clerk. Production MFA pricing conflicts with the current £0 incremental budget and remains a release decision; do not disable required MFA or make a paid commitment to resolve it.

No deployment, tunnel or paid resource has been created. Deployment remains prohibited until MVP is complete and separately approved.

## Sign-out and authenticator recovery

A failed provider logout does not restore app access. Keep the pending-cleanup screen open and retry, or use **Finish previous sign-out** on the sign-in page after a refresh. The HttpOnly encrypted cleanup capability expires thirty minutes after the original logout cutoff and never revokes a later sign-in. If it expires, sign in again to manage sessions; pending remote sessions are not represented as successfully cleaned up. A browser session that still exists can be cleared with **Sign out of this browser**.

Use **Use a backup code** during an authenticator challenge if the device is lost. Recovery opens account security, where replacing the old authenticator may require Clerk reverification. Set up a replacement, then verify a fresh code. Once the app has observed MFA enrollment, removing the factor cannot remove its MFA access requirement. Backup codes and Device Trust never establish fresh TOTP authority for financial actions.

QR setup is generated locally using the pinned `qrcode` encoder. The private URI/key is held only in the enrollment UI; no external QR image service receives it. Manual setup remains available if QR generation fails. Email-code resend is limited by a thirty-second UI cooldown as well as Clerk's provider-side limits.
