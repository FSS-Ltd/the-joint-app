# STMT1 — Statement-to-CSV converter

Date: 26 October 2026. Status: accepted MVP requirement intake; implementation has not started.

The user requested a converter near the end of the MVP so statements from banks without CSV downloads can use the existing import workflow. Deliver STMT1 after the core founder features and before final founder rehearsal/acceptance. It is a separate delivery unit with its own branch, verification, PR, CI and verified merge. No implementation starts before its predecessors pass their delivery gates.

## Required behavior

- Start with PDF statements, including a separately verified OCR path for scanned PDFs. Identify supported layouts explicitly; unsupported, unreadable, encrypted or ambiguous documents must produce safe, actionable feedback. Do not claim universal bank coverage without evidence.
- Process statement contents locally by default. Do not send documents to third-party AI or paid extraction services. Do not retain original statements on the server by default; any future retention needs an explicit privacy decision. Passwords used to unlock a PDF remain ephemeral and are never logged or stored.
- Extract transaction date, description, signed debit/credit amount and currency into the existing canonical CSV conventions. Distinguish transaction amounts from running/opening/closing balances. Preserve exact money and source dates; do not invent missing values, silently convert currencies, merge unrelated rows or promote pending entries to booked transactions.
- Provide a mobile-first, keyboard-accessible preview with source-page references, highlighted uncertainty and editable corrections. Require explicit confirmation before CSV generation or import. Low-confidence OCR and ambiguous dates/signs must be resolved rather than silently accepted.
- Offer CSV download and an explicit handoff to the existing account-scoped preview/import flow. Apply its ownership, permission, duplicate/overlap review and provenance rules. Imported statement data remains statement-derived historical evidence, never a live bank connection or proof of complete monthly history.
- Reconcile opening/closing balances or statement totals when supplied, flag discrepancies and preserve incomplete-history labels. Generated CSV must safely encode descriptions for spreadsheet use without changing financial amounts.
- Bound file size, page/row counts, memory and processing time. Support cancellation and clear temporary contents on completion, expiry, sign-out or permission loss as applicable.

## Acceptance

Use synthetic text and scanned statements, including multi-page rows, refunds, separate debit/credit columns, ambiguous dates, mixed/unsupported currencies, malformed/encrypted files and deliberately uncertain OCR. Verify exact dates and signed minor-unit amounts, correction before import, cross-format duplicate detection, cancellation, privacy, tenant/ownership isolation and accessible desktop/mobile behavior. No real household statements enter Git, fixtures, logs, prompts or CI.

The original CSV/manual path stays available. Direct bank/broker connectors and child profiles remain post-MVP. No deployment, tunnel, new paid service, OCR dependency or bank-format support claim is authorized merely by recording this requirement.
