# IOS2.1 — Easier native authenticator setup

The founder requested a QR code and, where supported, opening an authenticator
app directly. This focused identity follow-up builds on merged PR37, actual merge
099f3ce2820a3fa6d952e566ae8eaf3a2ccc3ccb. PR CI41610480514 and main
CI41618624503 passed. Remaining IOS2 runtime checks stay explicit; IOS3 is not
part of this change.

## Chosen approach

Reuse Clerk's public creation-time TOTP URI for both an on-device QR and an
explicit Open authenticator action. Keep the existing selectable manual setup
key as a fallback. Reuse the web application's qrcode1.5.4 encoder and add
Expo58's supported react-native-svg15.16.0 for one scalable native graphic.
This avoids thousands of native layout nodes for dense codes. It introduces no
QR service, DOM/webview, provider setting, native app-visibility permission or
new authentication authority.

Direct opening alone depends on an installed compatible handler; QR alone is
awkward on the same phone. Combining them supports both same-device setup and
scanning from another device. This is the implementation choice for the
founder's two requested options, not a new platform or branding decision.

## Behavior and design

- Keep the approved forest/ivory/sage design, current screen and shared controls.
- After deliberate setup creation, show a local black/white QR with a four-module
  quiet zone, an Open authenticator action and the manual-key reveal control.
  Use a bounded responsive graphic and existing scalable text/touch targets.
- Validate the URI against its matching creation secret before rendering/opening:
  bounded otpauth://totp only, a label, one matching secret, no credentials,
  port, fragment, control characters, duplicate or unsupported parameters.
- Invalid/missing URI or encoder failure preserves manual setup. An unavailable
  authenticator handler gives fixed helpful feedback; never display raw errors.
- Open only on an explicit press using existing expo-linking.openURL. Do not
  assume every authenticator handles otpauth, and do not mark setup verified.
- Keep secret and URI together in ephemeral screen state. Background/actor change
  conceals and clears both; retain only existing pending-enrollment metadata.
  Returning never generates another seed automatically. Explicit restart remains
  available if setup material was cleared before the user added the account.
- Enrollment confirmation and a separate fresh server TOTP check remain unchanged.
- Screen readers receive a static QR description, never its URI/secret. Manual
  key reading stays behind the existing explicit reveal action.

## Acceptance

Test URI rejection/matching, QR geometry/quiet zone, safe encoder/open failures,
explicit opening only, actor fencing, background clearing and preserved pending
verification. Run types/lint/format, units, relevant browser compatibility tests,
both exports, Doctor and local native builds. Inspect the native component with
non-sensitive sample data; do not save live setup secrets or invitation links.
A real authenticator handoff/scan needs a compatible installed app or the user;
record limits rather than simulating successful enrollment. Code Reviewer and
Application Security Engineer review before PR publication. Keep this follow-up
current through green current-revision CI and verified merge.
