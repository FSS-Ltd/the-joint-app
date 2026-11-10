# Founder Monthly Review Runbook

This runbook guides founders through the thirty-day financial and privacy rehearsal required before production release. Follow each stage sequentially. Record factual checksums and verification timestamps in the rehearsal ledger. Never place raw account numbers, personal credentials, or financial amounts into public logs or pull requests.

## 1. Initial Household Configuration and Independent Consent

1. Both adult household members create distinct accounts using separate credentials.
2. Member A sends a household invitation to Member B. Member B accepts the verified invitation token.
3. Each member adds their primary accounts:
   - Mark household joint accounts as shared.
   - Mark personal checking or credit accounts as private.
4. Verify account visibility boundaries:
   - Member A logs in and confirms that Member B's private accounts are not visible in account lists, spending summaries, or budget calculations.
   - Member B logs in and confirms that Member A's private accounts remain completely hidden.
   - Both members confirm that mutually consented accounts appear with clear ownership badges.

## 2. Statement Import and Data Ingestion Cycle

1. Import thirty consecutive days of transactions across the observed calendar month:
   - For CSV sources: upload via the native import flow, review column mapping, and verify duplicate rejection.
   - For PDF statement sources: use the local statement converter on mobile. Verify that PDF extraction runs on-device, check that opening balance plus net flows equals closing balance, and accept rows into the CSV import engine.
2. Confirm ephemeral file cleanup:
   - Verify that cached statement files in mobile temporary storage are removed immediately after parsing.
3. Validate transaction categorization and exclusions:
   - Flag internal transfers between household accounts to ensure they are excluded from net household spending.
   - Flag credit card settlement payments to prevent double counting.

## 3. Month-End Coverage Attestation and Review

1. Open the Month-End Review screen on native mobile.
2. Verify coverage status for all consented accounts:
   - Each member attests that transaction history for the observed period is complete.
   - Once all accounts are attested, lock the monthly review.
3. Inspect category spending against active monthly budgets:
   - Confirm that spending totals reflect exact minor-unit arithmetic without rounding discrepancies.
   - Verify that incomplete periods or missing accounts display unambiguous warning labels.

## 4. Local AI Companion Insights and Grounding Check

1. Pair a local companion device running Ollama on `127.0.0.1:11434`.
2. Generate monthly review insights:
   - Confirm that the companion receives only mutually consented financial facts.
   - Verify that the companion accesses data through deterministic tools (`get_spend_summary`, `get_recurring_costs`, `project_goal`, `compare_goal_scenarios`).
   - Confirm that no raw prompt text or financial numbers appear in external server logs.
3. Inspect generated suggestions:
   - Verify that recommendations cite exact transaction and baseline references.
   - Apply a suggested budget or goal allocation change through the native UI and confirm persistence.

## 5. Partner Revocation and Unlinking Drill

1. Member A navigates to account settings and revokes sharing consent for a previously shared account.
2. Member B refreshes their mobile session:
   - Verify that the revoked account disappears from Member B's view immediately.
   - Confirm that shared budgets and monthly spending totals recompute excluding the revoked account.
   - Verify that historical companion insight jobs derived from the revoked account are invalidated.
3. Unpair the local companion device:
   - Confirm that device authorization tokens are destroyed.
   - Verify that the mobile review UI transitions smoothly to deterministic card presentation without crashing.

## 6. Offline Shell and Network Resiliency

1. Disconnect network connectivity on the mobile device:
   - Verify that cached read models remain accessible locally.
   - Attempt a local edit and verify that clear offline notices appear without data corruption.
2. Reconnect network connectivity:
   - Confirm that sessions resume cleanly without duplicate event emission.

## 7. Encrypted Backup Restoration and Deletion Ledger Replay

1. Execute a database backup dump using the maintenance script.
2. Run the isolated local restore rehearsal:
   ```bash
   pnpm test:integration tests/restore-rehearsal.integration.ts
   ```
3. Verify restore invariants:
   - Runtime remains closed until restoration and deletion tombstones finish replay.
   - Canonical purge removes tombstoned user records.
   - Retained ciphertext decrypts cleanly using vault key versions.
   - Joint transaction history remains intact.
4. Verify log hygiene:
   - Inspect restore and server logs to confirm zero cleartext credentials, tokens, or financial records are logged.

## 8. Final Rehearsal Sign-Off

When all seven stages complete successfully, commit the verification record to `docs/progress.md` referencing the completed rehearsal run. Proceed to IOS18 physical device and release preparation.
