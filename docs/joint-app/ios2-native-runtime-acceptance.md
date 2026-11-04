# IOS2 configured native runtime acceptance

Updated: 4 November 2026. **Status: runtime checks recorded; delivery pending.**
This records current IOS2 evidence; it does not authorize IOS3 or certify the
finished app. The binding criteria remain
[IOS2 native identity](../decisions/ios2-native-identity.md#configured-runtime-acceptance).

## PR39 compatibility correction — 4 November

The first PR39 revision, `924c6de33bb390f615ab1a0a10b954e16580d6a3`, passed
Foundation checks but failed Native bundle checks in
[CI41740324178](https://github.com/FSS-Ltd/the-joint-app/actions/runs/41740324178).
Frozen installation, shared builds and mobile types passed. The online Expo
compatibility check then reported eight newer recommended SDK58 package versions;
Doctor and both exports did not run in that failed job.

The same online check reproduced the failure locally before the change. The
candidate aligns only those eight direct dependencies, keeps exact pins and
regenerates the lockfile:

| Package                          | Previous | Candidate |
| -------------------------------- | -------- | --------- |
| `@expo/metro-runtime`            | 58.0.16  | 58.0.17   |
| `@expo/ui`                       | 58.0.26  | 58.0.27   |
| `expo`                           | 58.0.22  | 58.0.23   |
| `expo-auth-session`              | 58.0.16  | 58.0.17   |
| `expo-constants`                 | 58.0.14  | 58.0.15   |
| `expo-linking`                   | 58.0.15  | 58.0.16   |
| `expo-router`                    | 58.0.29  | 58.0.30   |
| `react-native-safe-area-context` | 5.10.1   | 5.11.1    |

The existing online dependency check and Doctor remain unchanged. No package
exclusion or offline CI override is introduced. Installed CLI source confirms
that an offline check omits online emergency recommendations and Expo's own patch
assessment, so an offline pass would not satisfy the existing gate. This follows
[Expo's documented dependency validation](https://docs.expo.dev/more/expo-cli/#configuring-dependency-validation).

On the aligned candidate, frozen install, the online dependency check and all
20 Doctor checks pass. Root types and all 591 units across 84 files pass, as do
lint and formatting. Root production build succeeds with nine cached tasks;
mobile types execute freshly, and both standard-entry native exports pass.
Both local native rebuilds and artifact inspections pass. Android's Debug APK
has a valid v2 signature, the expected ARM64/SDK metadata and the same eight
permissions as the verified baseline; safe-area and SVG native codegen were
confirmed. Xcode 26.6 produced both ARM64 and x86_64 simulator slices with normal
ad-hoc signing and strict signature verification. No Apple account, team or
provisioning profile was used. Temporary native identifiers were restored out of
tracked configuration byte-for-byte before handoff.

The parent installed both aligned binaries on the existing approved devices and
served the candidate's standard-entry JavaScript. iOS displayed the empty
Welcome home form with the approved styling. Android displayed its expired-session
gate with household content concealed, then local sign-out settled to the empty
form with its email/password fields and Continue, account-creation and recovery
actions. The initial Android resume encountered a System UI/process-system ANR
before JavaScript ran. Reducing host contention and restarting the same owned
AVD without a data wipe allowed the subsequent startup checks to pass. No repeat
sign-in, new credential or auth-policy exception was used for this focused check.

The earlier signed-flow and founder-reported walkthrough observations below
remain attributed to merged `84da2976d9246204559d81d1af74176c7cc80583` and its
original native dependency versions. The aligned startup/form observations above
are separate; they do not relabel or repeat those earlier flows. Application
components, auth rules, React/RN versions and app permission configuration did
not change. Final independent reviews and successful new-revision CI remain
required before actual merge; the previous failed native job is not a pass.

## Source and delivery evidence

| Delivery                                                          | Reviewed revision                          | Actual merge                               | Host checks                                                                                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [IOS2 / PR37](https://github.com/FSS-Ltd/the-joint-app/pull/37)   | `8dfb550b5486b2fb889d1e9eb3b8d3388fa8b807` | `099f3ce2820a3fa6d952e566ae8eaf3a2ccc3ccb` | [PR CI](https://github.com/FSS-Ltd/the-joint-app/actions/runs/41610480514) and [main CI](https://github.com/FSS-Ltd/the-joint-app/actions/runs/41618624503) succeeded. |
| [IOS2.1 / PR38](https://github.com/FSS-Ltd/the-joint-app/pull/38) | `971f195078b1c95c89336a1f442c03fc2bf38c74` | `84da2976d9246204559d81d1af74176c7cc80583` | [PR CI](https://github.com/FSS-Ltd/the-joint-app/actions/runs/41632854737) and [main CI](https://github.com/FSS-Ltd/the-joint-app/actions/runs/41648118830) succeeded. |

PR38's final documentation revision retains reviewed implementation
`3ad81255ecea295d8db6cae24aeebb94026c8f91`. Its CI tested merge
`bb6f442e805384416e3fd81fe1f2da1a81994069` against the PR37 merge. Foundation
checks and Native bundle checks both succeeded; the parent revalidated their
host-reported conclusions and PR38's actual merge before preparing this record.
The reviewed PR38 head and its actual merge have identical trees.

PR38 verification includes 591 unit tests across 84 files, 324 integrations across
74 files, 181 browser tests, both native exports and Doctor 20/20. Code Reviewer
and Application Security Engineer independently cleared the implementation.
These are the recorded source/CI results, not fresh runs for this documentation.
The dependency audit has three existing baseline advisories: multer high and
minimatch/glob moderate. No new QR/SVG advisory was reported; the full audit is
not described as clean.

## Runtime and authority boundaries

- iOS: approved Smoke simulator, iPhone 17 Pro, iOS 26.3.1; local Xcode 26.6 build
  with normal simulator ad-hoc signing. An earlier unsigned build did not establish
  SecureStore access; it is not counted as a passing runtime.
- Android: owned API 36 Google APIs ARM64 emulator; local Android Debug build,
  installed APK and actual native rendering. The existing isolated AVD was reused.
- Both binaries use temporary local development identifiers. No production bundle
  or package identity was chosen or committed. No EAS/cloud build, push setup,
  store signing, deployment or review submission occurred.
- Runtime uses the approved development issuer and matching API audience/purpose
  profile with the existing provider, registry, idle, MFA and household checks.
  The same owned isolated API/database fixture and one approved disposable second
  adult were reused. Account credentials, keys, codes and invitation capabilities
  remain outside tracked evidence.
- Android's local API connection required a device-scoped reverse mapping. A
  temporary, independently reviewed diagnostic capture showed hydrated provider
  and storage state; it did not establish an SDK authentication defect. The
  mapping restored API admission. Instrumentation was restored to the merged
  source before subsequent acceptance; no product auth guard was weakened.

## Observed native evidence

| Area                                        | Evidence                                                                                                                                                                                                                                                                                                                            | Limits                                                                                                                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS sign-in and admission                   | Original approved account signed in and reached its household. The existing invited adult separately signed in; the founder entered both provider MFA and the later fresh household-session verification code. Parent observed the correct account and server TOTP proof.                                                           | Separate sign-in and household verification are distinct checks. No credential or proof was fabricated.                                                                                                 |
| Optional invitation                         | Invite later closed the form without a write. An eligible organiser could reopen the account action. Earlier real Share/Copy evidence remains valid for unchanged share code.                                                                                                                                                       | No repeated Copy result is claimed for the later fixture. Deferral does not revoke an already created invitation.                                                                                       |
| iOS invitation acceptance                   | Registered warm and cold delivery showed the deliberate invitation prompt for the verified invited adult. Parent accepted once. Native showed two of two adults with member-appropriate controls; read-only aggregates corroborated one household, two distinct active memberships, ADMIN/MEMBER roles and one consumed invitation. | Wrong-email, full-household, replay and separate-household isolation retain their integration-test scope; these were not all manually recreated.                                                        |
| iOS lifecycle and logout                    | Background concealment, signed foreground reconciliation, cold expired-session concealment, original local/fresh global logout and invited-member local logout were observed. Fresh global cleanup independently found zero active provider sessions; local transitions settled to empty Welcome home without pending cleanup.      | This does not recover the earlier runtime's unknown-key cleanup ticket. Wider physical snapshot/storage behavior remains unverified.                                                                    |
| Verification and recovery return            | Native recovery Send code reached the email challenge; background/return retained the same challenge without automatic resend. The synthetic entered draft was cleared, and cancellation was deliberate. Founder reported authenticator enrollment, background key/code clearing and fresh verification passed.                     | No Mail app was available on Smoke; no real inbox delivery, valid recovery completion or password change was tested. User-reported enrollment is distinguished from parent-observed fresh verification. |
| Easier authenticator setup                  | The actual native Hermes/SVG component rendered a public sample QR; Apple Vision decoded the exact expected URI. Explicit Open authenticator reached iOS Passwords, and manual reveal/hide passed.                                                                                                                                  | No sample credential was saved. Physical-device scanning and universal authenticator compatibility are not proven. Android external-authenticator dispatch was not separately verified.                 |
| Android signed runtime                      | Founder completed fresh original-account sign-in. Parent observed the existing two-adult household and organiser controls. Normal Home/foreground lifecycle launches returned to the same signed household. An earlier restored session's local logout settled to an empty form with committed revocation.                          | Intermediate foreground loading and overview snapshot privacy were not captured. Android enrollment/MFA was not separately repeated.                                                                    |
| Android registered returns and expiry       | The reviewed fixed-device launcher resolved implicit VIEW/BROWSABLE registration and opened the installed app in warm and cold modes. Parent observed the expired-session gate concealing account/household content after both.                                                                                                     | This reuses the already consumed invitation. It proves registered routing and expiry concealment, not another invitation acceptance or an active-session invitation prompt on Android.                  |
| Android keyboard                            | Actual Gboard on-screen entry produced a masked synthetic character; Backspace cleared it. The guest's down-arrow dismissed the keyboard and exposed Continue. No real credential was captured during this check.                                                                                                                   | Host keyboard forwarding was unreliable. Scroll-while-keyboard behavior and maximum text size are not proven by that observation.                                                                       |
| Android manual walkthrough — founder report | The founder reported all requested checks passed and settings were restored: final local logout to empty Welcome home, readable enlarged text with Continue reachable, and TalkBack spoken empty-form fields/actions followed by disabling TalkBack.                                                                                | This is the founder's report on the pre-alignment binary, not an independent automated observation or a complete accessibility certification.                                                           |

## Manual results, cleanup and delivery gate

The supported Android viewers render current frames, but computer automation
intermittently reports `noWindowsAvailable` for clicks even after the founder
made Studio visible and docked Running Devices. A focused reattachment did not
resolve it. Native window screenshots and successful SDK launches are not treated
as successful UI actions. No alternate input injection or blind-click workaround
was used.

The founder reported that the bounded manual Android walkthrough passed and
settings were restored. The parent separately checked the restored Android
settings. This resolves the earlier manual-result dependency at its reported
scope. The automated viewer limitation remains disclosed; the manual report on
the original binary is distinct from the aligned startup/form checks above.

The existing exact-owner disposable-adult CLI cleanup was executed under the
founder's prior approval. Both cleanup and the subsequent status check reported
deleted; the password-cleared tombstone and one-fixture guard were retained. No
original development account or additional identity was deleted.

After checking the owned Android device and the exact reverse-mapping
destinations, the parent removed those mappings and verified their absence. The
owned guest and durable API launcher stopped gracefully with successful exit
results; the runner's live claim was absent afterward. Owned Metro processes
stopped and the relevant API, Metro, emulator and viewer listeners were absent.
The task-owned Device Hub process stopped without closing unrelated IDE projects.
The iOS simulator was shut down after startup inspection. The owner-checked
consumed invitation file was retired without disclosing its contents.

The same durable database and private journal were intentionally retained for
handoff and reconciliation. This is verified shutdown and intentional retention,
not database disposal. Historical unknown-key fixtures/tickets remain untouched.
Native artifacts and both active checkouts are retained until handoff and the
repository's safe-cleanup audit; no worktree or retained private material was
force-removed. A later permanent disposal requires a concrete ownership-checked,
reviewed action and independently confirmed outcome.

VoiceOver spoken traversal, physical-device storage/snapshots, maximum
accessibility sizes and the broader OS/store matrix remain explicitly unverified
and belong to [IOS18](../superpowers/plans/2026-11-02-ios-only-delivery.md).
Current runtime checks and scoped cleanup outcomes are now recorded. Final
Code Reviewer and Application Security Engineer review of the five-file revision,
successful current-revision and required merge-revision CI, and actual PR39 merge
remain the delivery gate. The user requested finishing and merging PR39 here,
with remaining app delivery handed to a new chat. No IOS3 implementation,
scaffold or next-phase PR has started in this chat.

## Local test-tool verification

The ignored registered-return tools share one guarded private-file reader.
Android fixes the SDK executable, loopback ADB server, serial, owned AVD and
package; validates registration before a scoped cold stop; carries the capability
through bounded non-PTY stdin; strips client tracing; and emits fixed results.
The extracted iOS behavior retains its existing 36 tests.

The parent, Code Reviewer and Application Security Engineer each passed the
final combined 64 synthetic cases after a daemon-targeting review finding was
fixed. Syntax, scoped lint, formatting and diff checks passed. Neither review
substitutes for the actual warm/cold UI observations recorded above. These local
tools, private fixtures and temporary native configuration are excluded from
this delivery. The separate compatibility correction above changes only the eight
direct dependency pins and their lockfile graph; it does not change app components
or auth rules.
