# Native identity and household setup

The app uses Expo 58.0.22, React Native 0.88.1 and native React 19.3.0. Web keeps its separate React 19.3.1 dependency. Clerk Expo 4.14.5 supports these versions. The shared `@joint/identity-runtime` package contains the existing pure Clerk transitions and idle controller; web consumers keep their existing retry classification.

## Local setup

Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @joint/identity-runtime... build
pnpm --filter @joint/mobile start
```

Put only client-safe values in ignored `apps/mobile/.env.local`:

- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`: the actual application's Clerk publishable key. Never use a secret key, signing key, session token or user metadata here.
- `EXPO_PUBLIC_API_URL`: the actual API origin, without a path, query, fragment or credentials. Production requires HTTPS.
- `EXPO_PUBLIC_ALLOW_LOCAL_HTTP=true`: optional synthetic development testing only. Requires `__DEV__`, a `pk_test_` key and exactly `localhost`, `127.0.0.1` or Android emulator `10.0.2.2`. LAN/public cleartext endpoints and release builds fail closed.
- `EXPO_PUBLIC_AUTH_RETURN_URL=familyfund://auth-return`: optional; set only after that exact destination and Google sign-in are verified in the existing provider configuration. Leaving it absent disables Google without disabling password authentication.

Missing or malformed configuration renders an unavailable screen and does not initialize Clerk. An export made with a cleartext development API origin deliberately remains unconfigured in production. No production hostname, bundle identifier, Android package, association file or signing identity is supplied by this delivery unit.

## Provider and API prerequisites

Confirm Native API availability for the actual Clerk application before enabling it. Enabling Native API changes browser CAPTCHA coverage and requires existing authorization. Use the server setup described in [Clerk local setup](../../docs/joint-app/clerk-local-setup.md) and [IOS2 decision](../../docs/decisions/ios2-native-identity.md).

Native calls `getToken()` without a JWT template. The issuer's session customization must include the agreed exact string `aud` and `joint_token_use: "api-session-v1"`, preserving standard session and factor claims. Only then configure the server's private `CLERK_API_BEARER_AUDIENCE` to that exact audience. A publishable key or successful public environment probe does not prove API admission. No provider settings were changed by native implementation.

The application uses the maintained JS custom-flow SDK. Native Clerk UI synchronization is explicitly disabled because all controls are universal Expo UI; optional Clerk native components, biometrics, passkeys and native Google libraries are not installed. SecureStore's config plugin excludes encrypted values from Android backup; no biometric permission is requested. Required exact Expo peers are secure-store 58.0.2, auth-session 58.0.16, crypto 58.0.7 and web-browser 58.0.7. Crypto also supplies household idempotency keys. AuthSession/WebBrowser are used only for the configured SDK Google browser flow.

## Sessions, privacy and returns

Profile and household data, passwords, MFA setup keys and verification codes are memory-only. Nonsecret attempt IDs, email resend deadlines, pending authenticator enrollment and account-security navigation survive form concealment within the running app; actor changes clear them. Returning from an inbox or authenticator restores the existing step without sending a new code or automatically activating a completed attempt. AppState background/inactive events unmount protected forms and abort app requests. Foreground reconciles both identity and deadline before display. Reads and SDK refreshes do not earn activity credit. Genuine input uses the shared five-second coalescing cadence; deadline timers do not poll. Clerk's optional five-minute discovery polling is disabled. No SDK offline resource cache is enabled; offline authority failures conceal account data.

Logout commits server revocation before SDK sign-out. Provider cleanup capabilities are queued in device-only SecureStore and retried explicitly, including after restart; a later session cannot replace an earlier global cleanup capability. Transient failures retain each capability. Terminal rejection retires it only after durable storage succeeds, permits fresh sign-in, and states that remote cleanup was not confirmed. An API-rejected session also offers explicit local credential removal, scoped to the original actor and an existing SDK session. It preserves outstanding cleanup and is never reported as server or global revocation; ordinary network/503 failure does not offer that fallback. Only actual foreground AppState events enable foreground reconciliation.

Pending provider-only account tasks can be cancelled with a scoped SDK sign-out before this client registers an app identity; this does not claim global app revocation.

Password signup/sign-in, email/device verification, password recovery, username completion, TOTP and available backup-code sign-in follow existing shared transitions. Backup codes and email verification cannot become financial TOTP proof. Authenticator enrollment displays a private manual setup key; the next fresh code is verified by the existing server endpoint. Provider account tasks remain separate from app authorization.

The only auth destination is `familyfund://auth-return`. The SDK owns browser OAuth exchange; application activation requires a live pending attempt, the exact destination, a bounded nonce-only return and a ten-minute unexpired, unconsumed attempt. App code never accepts URL session IDs or tokens. Cold auth returns without an in-memory pending attempt fail closed; start sign-in again. Unsupported account requirements show an explicit unavailable state.

Invitations use a separate `familyfund://invitation?token=…` destination, kept in memory. They never activate an account and require deliberate acceptance by the server-verified invited email. Installations must register the scheme before external links work. Expo Go form inspection alone does not prove custom-scheme returns; production/dev-client IDs and registered provider return setup remain external prerequisites.

Households use existing GBP/Europe/London defaults. Creation and invitation drafts retain their idempotency key across request failures. The other adult is optional; invitations are shared only through an explicit user action. No automatic emails are sent by the client.

## Verification

```sh
pnpm --filter @joint/identity-runtime... build
pnpm --filter @joint/mobile typecheck
pnpm --filter @joint/mobile check:dependencies
pnpm --filter @joint/mobile check:doctor
pnpm --filter @joint/mobile bundle:ios
pnpm --filter @joint/mobile bundle:android
pnpm exec vitest run tests/native-identity-runtime.test.ts tests/native-identity-api.test.ts tests/native-logout.test.ts tests/native-auth-lifecycle.test.ts tests/native-security-lifecycle.test.ts tests/native-session-lifecycle.test.ts tests/session-idle-controller.test.ts tests/clerk-flow.test.ts
```

Use a named simulator/emulator explicitly. Preserve unrelated simulators and services; do not launch Chrome. Synthetic controller/API tests and exports do not establish real-provider authenticated runtime behavior. Full signed-session, TOTP, household, return registration, Android device, screen-reader and physical-device acceptance must be recorded separately with disposable authorized accounts and a configured API.
