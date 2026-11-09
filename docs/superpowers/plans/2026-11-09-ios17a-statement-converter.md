# Design Document: Local Statement-to-CSV Converter (IOS17a)

Date: 9 November 2026
Author: Jean-Fidele Ntagengwa
Status: Approved Implementation Plan
Delivery Unit: IOS17a (Statement Conversion)
Preceding PR: PR #67 (IOS16 Marketing and Web Household Cutover, merged at `6a12f4a`)

---

## 1. Problem Statement

Many UK banks and financial institutions only export statements in PDF format (either native digital PDFs or scanned documents). The existing Joint app import pipeline (`apps/mobile/src/features/imports/`) accepts CSV files only.
Without a converter, household users cannot ingest accounts from institutions that lack CSV exports without resorting to insecure third-party cloud converters or error-prone manual transcription.

Uploading bank statements to cloud extraction services or external AI providers violates the core privacy architecture of The Family Fund App. Therefore, statement extraction must happen entirely on device, with deterministic bounds, explicit review of uncertain fields, balance reconciliation when present, and an explicit handoff to the existing verified account-scoped CSV import workflow.

---

## 2. Architecture Approach & Key Decisions

### 2.1 Core Capabilities

1. **Document Intake and Validation:**
   - Accepts `.pdf` files via native document picker or file reader.
   - Enforces strict upper bounds: maximum 10 MiB, maximum 25 pages, maximum 1,000 extracted rows.
   - Rejects encrypted / password-protected files with safe, actionable feedback ("Password-protected PDFs must be unlocked before conversion.").
   - Validates file headers (`%PDF-`) and structural trailers before processing.

2. **Extraction Engine (Native & OCR Paths):**
   - **Native PDF Text Path:** Parses stream text blocks, font coordinates, and line positions to extract tabular rows.
   - **Scanned / OCR Path:** For image-only or low-text density pages, processes rasterized page text with confidence scoring per field.
   - **Deterministic Layout Profiles:** Supports standard UK bank statement formats (e.g., Lloyds / Halifax, Barclays, Monzo, Starling, HSBC, Nationwide) with explicit column detection (date, description, debit, credit, balance).
   - Ambiguous or unsupported layouts return clear explanatory feedback rather than hallucinating transactions.

3. **Transaction Parsing & Invariant Enforcement:**
   - Extracts exact transaction dates in ISO-8601 (`YYYY-MM-DD`).
   - Rejects or flags ambiguous date interpretations (e.g. `03/04/2026` where month and day could be swapped) for user confirmation.
   - Extracts exact signed amounts in minor units (`amountMinor` as integer string) and validates currency against ISO-4217 standard (`GBP`).
   - Separates transaction amounts from opening/closing balances or running statement totals.
   - Preserves source line and page coordinates for every candidate transaction.

4. **Interactive Review & Correction UI:**
   - Candidate rows are presented in a review workspace with confidence badges (`high`, `needs_review`, `low`).
   - Provides inline editing for date, description, amount, and debit/credit sign.
   - Users can exclude non-transaction rows (headers, summaries, balance checks).
   - Reconciles total debits and credits against statement summary totals when available.

5. **Canonical CSV Generation & Import Handoff:**
   - Compiles validated rows into RFC-4180 compliant CSV format with canonical headers (`Date,Description,Amount,Currency`).
   - Safely escapes CSV injection risks (`=`, `+`, `-`, `@` prefixed formulas wrapped securely).
   - Offers two exit paths:
     1. Direct handoff into the existing `useImportFlow` / `import-screen` for the selected account.
     2. Export / save CSV to device files.
   - Immediately wipes ephemeral PDF bytes and intermediate extraction buffers from cache memory.

### 2.2 Key Decisions and Rationale

| Decision             | Chosen Approach                                                                         | Rationale                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Processing Location  | 100% on-device local execution                                                          | Zero cloud upload of statements. Financial documents contain sensitive names, account numbers, and transaction descriptions.                       |
| Dependency Scope     | Standalone TypeScript parser with bounded regex/token analysis and pluggable OCR reader | Keeps bundle size minimal, deterministic, and free of heavy native binaries that could cause linking failures or security risks.                   |
| Import Boundary      | Handoff to existing CSV import workflow                                                 | Reuses the battle-tested, account-permissioned, duplicate-checking import engine built in Task 1.4 and IOS6. Avoids parallel ingestion code paths. |
| Rehearsal Separation | IOS17a builds converter; IOS17b executes founder rehearsal                              | Per roadmap gate, the software converter must be tested and merged before starting the one-month calendar observation rehearsal.                   |

---

## 3. Data Model

### 3.1 Statement Converter Types (`packages/contracts/src/statements.ts`)

```typescript
export type StatementLayoutKind =
  "single_column_amount" | "split_debit_credit" | "tabulated_grid" | "unknown";

export type ConfidenceLevel = "high" | "needs_review" | "low";

export interface ExtractedStatementRow {
  id: string;
  pageNumber: number;
  lineNumber: number;
  rawText: string;
  date: string; // YYYY-MM-DD
  description: string;
  amountMinor: string; // Signed integer string
  currency: string; // e.g. "GBP"
  direction: "DEBIT" | "CREDIT";
  confidence: ConfidenceLevel;
  confidenceReasons?: string[];
  balanceMinor?: string; // Optional running balance
  isExcluded: boolean;
}

export interface StatementReconciliation {
  openingBalanceMinor?: string;
  closingBalanceMinor?: string;
  totalDebitsMinor?: string;
  totalCreditsMinor?: string;
  calculatedDebitsMinor: string;
  calculatedCreditsMinor: string;
  isBalanced: boolean;
  discrepancyMinor?: string;
}

export interface StatementConversionResult {
  sourceFileName: string;
  fileSizeBytes: number;
  pageCount: number;
  layoutKind: StatementLayoutKind;
  institutionHint?: string;
  rows: ExtractedStatementRow[];
  reconciliation: StatementReconciliation;
  unrecognizedTextSnippetCount: number;
}
```

---

## 4. Failure Modes and Resilience

1. **Password-Protected / Encrypted PDF:**
   - Detects encryption dictionary in PDF header.
   - Returns safe refusal code `STATEMENT_ENCRYPTED` with clear explanation.
   - Ephemeral passwords are never stored or logged.

2. **Malformed or Truncated PDF:**
   - Validates `%PDF-` header and `%%EOF` marker.
   - If parser throws or encounters corrupted streams, returns `STATEMENT_MALFORMED`.

3. **Unsupported Layout or Scanned Image without Legible Text:**
   - Returns `STATEMENT_LAYOUT_UNSUPPORTED` with guidance to use CSV export from bank online portal.

4. **Resource Bounds & Cancellation:**
   - Files > 10 MiB, pages > 25, or rows > 1,000 trigger bounded refusal before heavy processing.
   - `AbortSignal` allows immediate user cancellation, clearing memory buffers.

5. **Memory and Cache Hygiene:**
   - Ephemeral picked PDF files in cache directory are explicitly deleted upon completion, error, or discard via `discardLocalFile`.

---

## 5. Security and Privacy Boundaries

1. **Zero Cloud Transmission:**
   - Verification tests prove no network requests are made during parsing or conversion.
2. **Provenance & Audit:**
   - Converted CSV includes header comments or provenance metadata marking source as `statement_converter_v1`.
3. **Tenant & Account Scoping:**
   - Handoff targets only accounts for which the authenticated member holds `EDITOR` or `OWNER` grants.

---

## 6. Rollout and Rollback Plan

- **Rollout:** Delivered in `apps/mobile/src/features/statements/` and surfaced as "Import from PDF Statement" action in `apps/mobile/src/features/imports/import-screen.tsx`.
- **Rollback:** If extraction issues occur, users retain the primary CSV import path without disruption. The feature toggle or screen button can be safely hidden.

---

## 7. Success Metrics & Acceptance Criteria

1. 100% deterministic parsing on synthetic test statements (single-column, split-column, multi-page, refunds).
2. Exact date and minor-unit preservation verified against known fixtures.
3. Accessible review UI with keyboard support and clear contrast.
4. Clean RFC-4180 CSV generation and seamless handoff to `useImportFlow`.
5. All local suites (`typecheck`, `test`, `lint`, `format:check`, `bundle:ios`) green.
6. Code Reviewer and AppSec Reviewer formal APPROVE verdicts.
