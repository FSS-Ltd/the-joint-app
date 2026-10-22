# The Joint App — Security, Privacy and Release Controls

**Baseline:** A cloud-backed, non-custodial household finance app with local AI inference.

**Status:** Technical controls and review requirements; not a claim of certification or a legal opinion.

**Related:** [architecture](02-architecture-and-project-structure.md), [integrations](04-account-integrations.md), [paywalls](06-paywalls-and-mobile-launch.md).

## 1. Protect the actual data flows

Sensitive assets include transaction descriptions, balances, holdings, child records, provider credentials, auth sessions, relationship/sharing settings and AI evidence. These can reveal far more than a bank balance. Financial information is sensitive in practice; not every financial row is automatically a UK GDPR special-category record, but merchant data may reveal protected characteristics.

The principal threats are cross-household access, a partner seeing private records, stolen sessions/provider keys, duplicate or manipulated imports, abusive account recovery, harmful AI disclosures and deletion/restore mistakes.

Use OWASP ASVS Level 2 as the application control baseline, with stronger targeted credential/cryptography controls. Add OWASP mobile guidance during Phase 5 and an AI prompt-injection test set. These are engineering targets, not a certification claim. [OWASP ASVS](https://owasp.org/projects/asvs), [OWASP prompt injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/).

## 2. Identity and authorisation

Require individual adult identities and verified email. Offer maintained MFA; require it before real financial linking, exports, widening sharing and device pairing. Account recovery must not rely on the other partner. Provide recovery instructions and an audited process that never sends provider secrets to support staff.

Validate signed sessions and live membership. A blocked/deleted user cannot continue until their JWT expires: check application session revocation and status on requests and jobs. Reauthenticate within five minutes for credentials, export of detailed history, device pairing, deletion and grant widening.

Resolve account permissions from the database. Household billing/admin status grants no private-account access. For each supported action, test household A versus B, owner versus partner, NONE versus TOTALS versus TRANSACTIONS, revoked membership and a valid token for a disabled session.

For web mutations, require CSRF protection and origin checks with secure same-site cookies. Restrict CORS to approved origins; a mobile bearer path does not justify wildcard cookie access. Use PKCE/state/nonce where the actual auth protocol requires them and validate all redirect URIs.

## 3. Encryption, secrets and IAM

- Require TLS for client/provider/database traffic.
- Encrypt disks, database backups and private object storage.
- Envelope-encrypt provider credentials using KMS and authenticated encryption, binding household/connection IDs as associated data.
- Separate KMS and database administration; a DB dump alone must not decrypt connector secrets.
- API responses never return stored secrets; credential forms are write-only and excluded from request-body capture.
- Use EC2 instance roles and GitHub OIDC rather than long-lived AWS keys.
- Grant each runtime the minimum KMS actions and resource prefixes. The local AI device receives no cloud-admin, database or provider credentials.
- Keep migration credentials out of the normal API/worker environment. Infrastructure admins use MFA and emergency access is audited.
- Rotate credentials after suspected exposure. Design key-version migration before the first real provider credential is stored.

This design is not end-to-end encryption: authorised application services can process financial data for syncing, reports and projections. Do not market it as E2EE or claim the operator is technically incapable of accessing the database.

## 4. Tenant isolation and derived information

Use an unexposed finance schema, non-owner runtime roles, RLS and scoped repositories. Transaction-local context prevents pooled requests inheriting a previous household. Add negative tests against the real database role, not only mocked guards.

Derived data has source dependencies. Reports, saved scenarios, exports and AI narratives must pass the viewer's current grants at read time. A revoked source invalidates the whole affected AI narrative until recomputed for the new scope; deleting a name from prose is insufficient.

Scope caches by user, household, grant version and query. Disable public caching for finances. No financial values, merchant names or child identifiers enter analytics events, error breadcrumbs, page titles, notification payloads or shared URLs.

TOTALS must not reveal a private account's spending via transaction counts, categories, merchant trends or a subtraction between inconsistently scoped widgets. If a combined insight needs both adults' transaction access, require both grants.

## 5. Shared households, separation and deletion

A partner can leave without the other person's approval. Before exit, allow export of their authorised records. Immediately revoke household sessions, partner grants and affected device permissions.

Single-owner records remain accessible to their owner through the separate authenticated owner archive routes (`/v1/me/archive/...`). These resolve `OwnerArchiveContext` from recorded AccountOwner identity, not active membership or a caller-provided household. Archive RLS/repositories allow only the owner's retained accounts and have their own negative tests; old partner grants and shared narratives do not carry over. Connections consented by the departing member stop and follow normal upstream revocation; independently authorised remaining-member connections can continue. The archive is read/export-only; new household work uses explicit import or a future reviewed transfer.

Single-owner records remain with their owner. A household admin cannot delete the other adult's separately owned accounts as a side effect of deleting their own login. For verified joint ownership, preserve independently justified source records for both verified owners; remove the departing member's household access while allowing their owner-only joint-history archive. A former viewing grant is not ownership. Exclude the other adult's private notes/profile and minimise unnecessary personal data. Do not create an automatic cross-household copy: a future supported transfer requires an explicit ownership-safe workflow.

At MVP, after a household ends, each adult may create a new household and import their own records. Record movement is an audited future migration task, not a hidden subscription restore feature. Child records need a designated managing adult and an explicit review if that adult leaves; do not silently grant them to an unrelated replacement member.

Subscription cancellation, provider disconnection, leaving a household and account deletion are separate operations. Explain consequences clearly. None is paywalled.

## 6. Local AI boundary

The paired computer is a trusted endpoint. Each source owner approves disclosure to that named device in addition to the partner's viewing grant. Minimise evidence and use authenticated device-specific encryption. The operator of that computer can potentially inspect permitted plaintext in memory; revocation cannot recover information already disclosed.

Bind Ollama to loopback, disable cloud models, pin manifests and reject arbitrary endpoints. Prompt injection from merchant descriptions cannot grant tools, change account scope or execute SQL. The service only supports narrow read-only intents. Treat model output as untrusted until schema, evidence and policy checks pass.

Fresh online execution permission, expiring leases, rechecks at completion/view and deletion of revoked results reduce future exposure. A 24-hour queued-job TTL is not permission to process offline for 24 hours.

## 7. Retention schedule proposed for implementation

These are design defaults, subject to provider contract and documented lawful-basis review. Required legal retention is separately scoped and minimised; do not apply a blanket finance-record retention period to all app data.

| Data class                                 | Default retention                                                                  | Deletion/revocation behaviour                                                                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normalised finance records and corrections | While account is active, with user deletion controls                               | Active-system deletion targeted within 30 days of verified eligible request                                                                                    |
| Provider credentials                       | While connection and ongoing access are authorised                                 | Stop local use immediately; revoke upstream then remove ciphertext promptly, normally within 24 hours; retain only minimal revocation metadata if retry needed |
| Uploaded statement/CSV originals           | Seven days after successful import                                                 | User can delete earlier; retain normalized rows unless separately deleted                                                                                      |
| Raw provider payloads                      | Maximum seven days, encrypted                                                      | No indefinite debugging archive                                                                                                                                |
| Exports                                    | App download token expires after 15 minutes; private object deleted after 24 hours | Authenticated app proxy rechecks current grants on every download; never expose a bearer-only S3 presigned URL                                                 |
| AI queued question/evidence                | Queued question <=24 hours; fetched envelope <=15 minutes                          | Plaintext memory only; cancel/delete on revoked dependency                                                                                                     |
| AI displayed cards/conversations           | 30 days by default unless user deliberately saves an authorised result             | Delete/invalidate on source revocation; no model training                                                                                                      |
| Operational logs                           | 30 days, payload-free                                                              | Masked identifiers; no raw financial narratives                                                                                                                |
| Security audit metadata                    | 180 days proposed                                                                  | Minimise identifiers; review justified exceptions                                                                                                              |
| Encrypted backup sets                      | 30-day maximum proposal; managed plan may retain less                              | Age out; deletion ledger replayed before restored system serves traffic                                                                                        |
| Billing/legal records                      | Separate reviewed retention policy                                                 | Restrict to evidence actually required; no reason to retain full transaction histories                                                                         |

An in-progress export stream should be cancelled on known revocation, but already delivered bytes cannot be recovered. Grant changes invalidate export jobs/tokens and prevent new or resumed downloads. Object URLs and AWS credentials never reach the client.

Do not promise complete instant deletion from immutable backups. Maintain a deletion ledger outside any individual backup set. After restore, apply all later deletion/revocation entries before reconnecting providers, sending emails or serving users.

Saved results on downgrade follow the same retention policy as paid results. “History remains available” does not mean prompts are retained forever.

## 8. UK data protection work

Embed privacy in the design and record the lawful basis for each purpose rather than asking for a single blanket consent. Separate bank consent, account sharing, local-device disclosure, marketing choice and contract acceptance. A consent to connect a bank is not permission for unrelated advertising or model training.

Before real founder deployment, map controllers/processors, vendors, subprocessors, hosting regions, support access, international transfers, encryption and deletion responsibilities. Before public use, complete a DPIA assessment and the full DPIA where required. Document rights-request handling, the privacy notice, processing records and incident responsibilities. Assess ICO registration/fee obligations and appropriate contractual arrangements.

The ICO's current privacy-by-design guidance reflects the Data (Use and Access) Act 2025 changes and includes children's higher protection considerations. Parent-managed records reduce unnecessary child access but do not replace a documented applicability assessment. [ICO guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/guide-to-accountability-and-governance/data-protection-by-design-and-by-default/).

Select London explicitly, but review international transfers for all vendors; database region alone is not GDPR compliance. [Supabase regions](https://supabase.com/docs/guides/platform/regions).

## 9. Financial-service and commercial perimeter

The application displays account information and analyses it, so obtain a qualified assessment of the AIS model and the selected provider arrangement. Read-only status does not by itself resolve the issue. Document who contracts with users, captures consent, supplies the regulated service, handles complaints and covers obligations. Provider permissions for personal, shared and commercial use are distinct. [FCA AIS models](https://www.fca.org.uk/firms/agency-models-under-psd2).

Keep assistant scope to record explanations and user-directed hypothetical projections. A “not advice” sentence does not make personalised product recommendations harmless or remove regulatory questions. No security recommendations, trade actions, automated switching or regulated product brokerage in this MVP.

Trading 212 permission is an explicit pre-development gate for its intended custom/shared integration; see [04](04-account-integrations.md) for the precise contract evidence. Avoid copying that supplier's API into a consumer app while assuming later approval will solve the problem.

Before paid public launch, review consumer subscription rules at the actual launch date, relevant tax handling, store policies and the chosen legal entity. The October 2026 subscription guidance discussed in [06](06-paywalls-and-mobile-launch.md) is draft, not an assertion that future requirements already apply.

## 10. Security evidence required before release

| Gate                      | Evidence                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Before real data          | Tenant/access matrix tests, secret-log redaction, backup restore, private buckets, auth/MFA and callback checks        |
| Before companion use      | Named-device consent, key storage, local-only networking test, revocation race tests, evidence minimisation            |
| Before external beta      | Reviewed DPIA/perimeter assessment, rights/deletion tests, incident contact, independent security review               |
| Before public paid mobile | Targeted penetration test, native storage/deep-link tests, complete billing lifecycle, final vendor/store/legal review |

Risk is evaluated against actual scope. A synthetic local prototype does not need a pretend compliance certificate; a public product holding private financial histories does need the evidence above.
