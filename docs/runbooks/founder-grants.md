# Local founder capability grants

The application defaults to Free: `finance.manual` and `projections.basic`.
Exports, privacy, deletion, leaving and revocation have no paid capability gate.
There is no billing implementation or email allowlist. A grant reserves access to
named capabilities; it does not implement a future feature, approve a provider,
grant account ownership or authorise spending.

Only the local maintenance database identity can issue or edit a grant. The
application runtime can read only its current recipient's grants. Use a reviewed,
verified active membership UUID and a named issuer with a concise non-sensitive
reason. Never put credentials, account numbers or financial information in a
grant reason. No grants are issued automatically by setup or seed.

Example parameterised SQL for a maintenance session:

```sql
WITH issued AS (SELECT date_trunc('milliseconds', transaction_timestamp()) AS at)
INSERT INTO app."EntitlementGrant"
  (id, "householdId", "membershipId", "userId", issuer, reason,
   capabilities, "issuedAt", "expiresAt")
SELECT gen_random_uuid(), m."householdId", m.id, m."userId",
       $2, $3, $4::text[], issued.at, issued.at + interval '30 days'
FROM app."Membership" m JOIN app."User" u ON u.id = m."userId"
CROSS JOIN issued
WHERE m.id = $1::uuid AND m.status = 'ACTIVE' AND u.status = 'ACTIVE';
```

Supply parameters with a database client; do not paste untrusted input into SQL.
Verify exactly one inserted row. The seven allowed capability names are defined
in `packages/contracts/src/entitlements.ts`; the calculator is
`packages/entitlements/src/capabilities.ts`. The database rejects a missing issuer
or reason, unknown capabilities and expiry beyond ninety days from issue.
Maintenance edits append provenance to `EntitlementGrantAudit` and advance the
grant revision. Review that audit record after issuing or revoking.

To revoke a known grant, execute a parameterised update setting `revokedAt` to
`clock_timestamp()` for its UUID, then verify the recipient's
`GET /v1/households/{householdId}/entitlements` response through their normal
authenticated session. Never impersonate the recipient with maintenance
credentials. The server uses database time and fresh session/membership scope.
Expiry and revocation change the entitlement version and block subsequent
capability checks. Already unavailable provider features remain unavailable.

Bank, broker and companion limits are contract ceilings only. Free has zero paid
resource capacity. A relevant grant permits at most four bank authorisations,
two broker connections or one companion device. It creates none of these
resources and cannot override their independent permission or release gates.
