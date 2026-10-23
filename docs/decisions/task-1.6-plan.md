# Task 1.6 — Entitlements, privacy and local recovery

Predecessor PR #12 is verified MERGED into main at `81bdd0897decc5bca6145e73f8303538a49b0be1`. Its final head `9393e3c2b93b2084ae5c8fadb342da2c39f870bb` passed required Foundation checks, run 39900878616; the actual tested merge was `d81328d0db80f56713eb0b90d583a8193a9bd6fb`. Evidence: https://github.com/FSS-Ltd/the-joint-app/pull/12#issuecomment-6357429187. Branch: `build/1.6-entitlements-privacy-recovery`.

## Authority and boundaries

Everything remains local until the entire MVP is complete and the founder explicitly approves deployment. This includes previews, staging, hosted databases, deployment hooks and deployment rehearsals. GitHub source and synthetic CI remain authorised. The canonical task's deployment rehearsal is replaced by an isolated local restore exercise. No production readiness, compliance, provider permission or recovery-time gate is claimed.

Ruling: continue the authorised project without another plan approval round. Changes below implement the existing Task 1.6; they do not introduce billing, direct bank/broker connections, child profiles or another build step. Existing Vercel Pro entails no new approved spend.

## Scope and contracts

1. Add a pure `@joint/entitlements` package and server-authoritative entitlement service. The seven capabilities are `finance.manual`, `projections.basic`, `connections.bank`, `connections.broker`, `projections.advanced`, `categorisation.automation` and `insights.local`. Free always includes the first two. A maintenance-issued founder grant records issuer, reason, issued/expiry times and named capabilities, lasting no more than 90 days. No email allowlist, client Plus flag or entitlement can grant account access or provider permission. Expired/revoked grants cannot authorise new work. Export, leave, deletion and revocation remain free.
2. Implement permission-scoped, encrypted, asynchronous CSV export with authenticated downloads, a 15-minute download window and 24-hour object retention. Preserve exact decimal amounts; escape spreadsheet formula cells. Bound processing in chunks, not by silently truncating history. Recheck each source's current access at request, execution and download. A changed or revoked scope invalidates the entire export, including resumed requests. Cancel known revoked streams; bytes already sent cannot be recovered. Download tokens do not replace authentication. No object-store credentials or public object URLs reach clients.
3. Implement leave and separate read-only owner archive routes. Resolve archive authority from the live identity and recorded ownership, never former viewing grants or caller-selected household. Leaving revokes household sessions and grants immediately, retains sole/verified joint source records for their owners and permits subsequent owner archive login. Never copy another adult's private notes or account records into that archive. Retained joint records remain independently available to verified remaining owners.
4. Implement verified deletion requests and a durable lifecycle with safe status. Recent MFA is required for exports and deletion. Immediately revoke app access; purge only eligible personal/source records without deleting another owner's history. Preserve minimal audit/tombstone references where foreign keys require them. Provider deletion failures remain visibly pending; never report completion while a provider identity remains. Any account purge must first remove affected complete budget scopes, preventing partially retained published scope graphs.
5. Add payload-free audit correlation and safe diagnostics. Permit only documented codes, UUID identifiers, counts and durations. Exercise actual synthetic secret/token sentinels through failure paths and inspect captured output.
6. Demonstrate a local backup restored into a new isolated database, with later independent deletion-ledger entries replayed before application access. Never reset the development database. Document key custody, ledger ordering, verification and recovery failure handling. Production backups, KMS, RPO/RTO and vendor checks remain future gates.

`GET H/entitlements` returns `{plan,version,capabilities,caps,effectiveUntil}`. Plan is `FREE` or `PLUS`; free paid-resource caps are zero, grant-enabled resource caps are at most four bank authorisations, two broker connections and one companion device. These limits reserve a contract and create no providers or devices. Founder grant expiry reflects the earliest expiry affecting the returned capabilities; the service rechecks the database on every authorisation.

Use the canonical household export, `/v1/me/archive/...`, `/v1/privacy/deletion-requests` and `DELETE H/memberships/me` routes. Strict boundary schemas, opaque sessions, origin/CSRF checks, no-store responses and uniform unavailable-object responses apply. Archive and deletion authority require dedicated policies rather than weakening active-household RLS.

## Delivery sequence and ownership

Implement and verify bounded portions within this one build step: entitlement contracts/persistence/service; privacy ownership/lifecycle policies; export worker/download fencing; mobile privacy/archive UI; redaction and local restore. Independent work may be delegated with explicit file ownership and agreed interfaces. Parent integrates controllers, reviews every diff and owns full-step delivery. Do not create the next step or split this task into an unverified progression.

Write meaningful failing tests before each behavior, then implement and rerun. Additive migrations retain existing history and restricted-role protections. Do not rewrite applied migrations or use maintenance credentials in application endpoints. No new third-party dependency is planned: existing Zod, Prisma/PostgreSQL, AES vaults and test tooling cover this step.

## UI direction

Use the existing design-craft direction from the inspected NU.Finance and Payrix references: clear hierarchy, comfortable mobile spacing, opaque soft surfaces and evergreen/ivory/sage/apricot tokens. Privacy actions state their real consequences. Include empty, pending, success, permission loss, expired download, failed retry and destructive confirmation states. Bank disconnection stays explicitly disabled because no direct connection exists. Archive is visibly read/export-only. No purchase or fabricated subscription flow.

## Acceptance and review focus

- Entitlement tests cover forged client flags, expiry boundaries, bounded grants, free safety controls and account-permission independence.
- Real restricted-role tests cover ownership versus grants, another household/user, leave without pre-exit export, verified joint history, author-private notes, revoked exports, stale/racing jobs, authenticated expiry and deletion without collateral account loss.
- CSV tests cover formula injection, quotes/newlines/Unicode, exact signed amounts, pagination completeness and bounded chunk processing.
- Actual API/worker diagnostics contain no synthetic secret sentinel. Independent ledger replay prevents restored deleted users from regaining access.
- Real browser journey: two adults, accounts, CSV import, budget, grant downgrade, export and leave/archive. Inspect 390/1280px, 320px overflow, keyboard, zoom and reduced motion.
- Run frozen installation, formatting, lint, all types, unit/integration/browser suites and all builds. Verify clean-source installation and all migrations against a fresh isolated database. Run independent whole-step review and resolve findings before opening the PR.
- Raise this step's PR after local verification. Record final head, actual tested merge revision, current required CI and actual authorised merge. Do not begin another step before verified merge.

State: planning and implementation in progress. No Task 1.6 verification, PR, CI or merge is claimed.

## Implementation rulings and evidence

Ruling: use a dedicated leased deletion-request queue for global identity work, because the existing financial Job model requires household membership. This permits deletion before a person creates a household without fabricating a financial household. Claims use bounded leases, restricted database functions and retry-safe provider deletion; no second general-purpose job system is introduced.

Ruling: persist verified deletion and leave intent in a private, fsynced local journal outside database dumps. Validate live identity before writing intent and recheck database authority before revocation. If the final database write fails after a durable intent, retain that verified intent for operator reconciliation rather than silently discarding it. Restore replays all intents, including users absent from the snapshot. The local journal is not a production secret-store or backup policy.

The restricted-role capacity tests reproduced a correlated archive RLS scan regression. Additive statement-scoped account/batch sets retained committed-import and author-note boundaries. The unchanged 50,000-row import and report tests passed afterwards. Financial export source epochs likewise use statement transition tables instead of repeated per-row invalidation queries. No row count or timeout was reduced.

The actual local Auth integration verifies a fresh real authenticator, journal-before-revocation ordering, a user with no household, worker purge, provider deletion and denied subsequent login. A reproduced generic-404 defect now requires the maintained provider's explicit `user_not_found` error code before treating absence as confirmation. Generic errors remain pending. Worker credentials are loaded from a separate local-only file; the API receives only the journal path.

Current intermediate checks include entitlements, archive/deletion restricted-role tests, complete exports, worker Auth deletion and the actual browser journey through import, budget, downgrade, export, leave/archive and deletion receipt. Full combined regression, isolated recovery proof, fresh source/database verification, independent review and delivery remain required. This is not a completion or merge claim.

Independent review reproduced and resolved successful-looking partial CSV streams, final-owner joint-history retention after both deletions, and retry queue starvation. Downloads require explicit authorised EOF; missing chunks and expired authority abort the HTTP body, with allowlisted diagnostics only. Shared history survives for active or disabled recorded owners, but deleted tombstones cannot retain it after final-owner purge. Database-clock retry scheduling has bounded exponential backoff and allows newer eligible deletion requests to proceed. Deterministic sequential/concurrent ownership, fairness, expiry and HTTP-stream regressions passed.

The clean-source database run exposed Docker source discovery failing for a dynamically assigned host port. A real disposable probe and regression reproduced the failure. Recovery now discovers candidates by PostgreSQL's exposed container port, then independently requires the exact loopback host binding and exactly one matching container. No network-binding or ownership guard was weakened.
