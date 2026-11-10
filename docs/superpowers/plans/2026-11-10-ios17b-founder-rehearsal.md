# Design Document: Founder Financial and Privacy Rehearsal (IOS17b)

## Problem Statement

The founder MVP requires concrete, observable proof of a full month of real household usage before public launch. Synthetic unit and integration tests prove code paths in isolation, but they do not prove that two adults can live with the software across an elapsed calendar cycle without data corruption, unauthorized sharing, arithmetic drift, or privacy breaches.

IOS17b delivers the operational runbook, redacted acceptance ledger, and deterministic verification suite that validate:

1. Two adult members managing shared household finances with strict account-level privacy.
2. An elapsed 30-day calendar month observation of statement imports, spending caps, and category totals.
3. Deterministic wealth valuation and projection comparison without floating-point errors.
4. Privacy isolation during partner revocation and device unpairing.
5. End-to-end encrypted backup recovery and deletion-ledger replay.

## Architecture and Key Decisions

### Decision 1: Redacted Opaque Acceptance Evidence

No real bank account numbers, passwords, personal names, or raw AI companion prompts may enter version control or test logs. The rehearsal records sha256 checksums, deterministic entity IDs, transaction counts, and invariant proofs.

### Decision 2: Founder Monthly Review Runbook

Create `docs/runbooks/founder-monthly-review.md` specifying step-by-step instructions for:

- Two-adult independent authentication and account sharing consent.
- Month-end review attestation and coverage sign-off.
- Local AI companion insight execution and explanation inspection.
- Device unlinking, grant revocation, and export drills.
- Backup creation, offline restore rehearsal, and ledger replay validation.

### Decision 3: Deterministic Financial Verification Suite

Implement `tests/founder-rehearsal.test.ts` to exercise:

- Two distinct adult members in one household with independent credentials.
- Mutual sharing boundaries: only explicitly consented accounts are visible to the partner; individual accounts remain hidden.
- Statement conversion integration: converting local statements, reconciling debits and credits, and importing into activity.
- Monthly review attestation: both adults attesting account-month coverage before locking period figures.
- Deterministic wealth and goal projection calculations: comparing baseline vs accelerated scenarios using exact minor-unit integer math.
- Revocation drill: when one partner revokes account sharing or unpairs their companion device, the server immediately blocks partner visibility.
- Recovery drill: validating that database backup restoration preserves joint history while honoring tombstone ledgers.

## Data Model

### Founder Rehearsal Ledger (`FounderRehearsalRecord`)

```ts
export interface FounderRehearsalRecord {
  rehearsalId: string;
  observedMonth: string; // "2026-10"
  householdId: string;
  adultMembers: [string, string];
  consentedAccountIds: string[];
  privateAccountIds: string[];
  reconciliation: {
    openingBalanceMinor: string;
    totalCreditsMinor: string;
    totalDebitsMinor: string;
    closingBalanceMinor: string;
    isBalanced: boolean;
  };
  projections: {
    baselineGoalMonths: number;
    acceleratedGoalMonths: number;
    deltaMonths: number;
  };
  companionAttestation: {
    pairedFingerprint: string;
    toolsExercised: string[];
    zeroUnauthorizedDisclosure: boolean;
  };
  revocationVerified: boolean;
  recoveryVerified: boolean;
  status: "COMPLETE";
  completedAt: string;
}
```

## Failure Modes and Resilience

1. Discrepant Statement Totals: If opening balance + credits - debits does not equal closing balance, the review screen flags the period as unbalanced, preventing automatic coverage attestation.
2. Companion Device Disconnection: When the local AI companion is offline, the review UI shows clear status and provides deterministic monthly review metrics without interruption.
3. Mid-Review Revocation: If an adult member revokes access to an account during an active session, subsequent queries immediately omit that account and recompute totals without caching stale rows.
4. Partial Restore Corruptions: Encrypted database restoration verifies hash integrity and replays deletion events before allowing user login.

## Security and Privacy Boundaries

- Strict Role Enforcement: Neither adult can see accounts belonging to the other without explicit, active consent grants.
- Zero Cloud Leakage: Companion insights run strictly over loopback (`127.0.0.1:11434`) using bounded tools (`get_spend_summary`, `get_recurring_costs`, `project_goal`, `compare_goal_scenarios`).
- Ephemeral Statement Handling: Picked PDF files are deleted immediately after in-memory parsing.
- Audit Log Provenance: Sensitive administrative actions (grants, revocations, archive exports, deletions) generate tamper-evident audit records.

## Rollout and Rollback Plan

- Rollout: Run automated rehearsal suite `tests/founder-rehearsal.test.ts`, confirm all unit and integration assertions pass, verify runbook documentation, obtain independent code and AppSec reviews, and merge into `main`.
- Rollback: If any rehearsal assertion fails, mark the rehearsal incomplete and block release progression to IOS18 until remediated.

## Success Metrics

1. 100% deterministic arithmetic agreement across monthly review, wealth tracking, and goal projection engines.
2. 0 unauthorized disclosures across partner accounts during ordinary review and post-revocation states.
3. 100% successful execution of local backup restore and deletion replay verification.
4. Zero em dashes and zero banned words in all documentation and test strings.
