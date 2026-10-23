# Task 0.3 — Investment import and API permission boundary

Checked 23 October 2026. Current build is CSV/manual only. No live broker adapter, key collection, provider API call, order placement or provider-specific API implementation is authorised or delivered by this task.

## Current scope

Generic owner-uploaded CSV/manual investment records may progress through the normal delivery gates. Confirm source currency, account wrapper/entity and legal holder during onboarding; never infer joint ownership from family use. Validate uploads, mappings and permissions server-side. Do not fabricate positions or returns for an empty account. Crypto is outside the agreed investing scope. Specific source export schemas still need actual permitted fixtures before support is advertised.

Account-level details stay in the ignored private inventory. Generic imports do not need API credentials and must not ask users to generate them. UI must label uploaded records as imported/manual and show source dates, rather than claiming connected or current market data.

## Source evidence

The [official API terms](https://www.trading212.com/legal-documentation/API-Terms_EN.pdf), reviewed 23 October 2026, restrict use beyond personal testing; clause 6.3 requires written permission before API applications intended for other end-users, and 6.7 conditions custom interfaces on written consent. Market-data terms also restrict third-party disclosure. Keep T1 missing until app-specific permission is documented; an API key or family consent is insufficient.

The [official documents guide](https://helpcentre.trading212.com/hc/en-us/articles/11700508002845-What-documents-can-I-get-from-Trading-212) documents app CSV exports for trading data. That establishes an export mechanism, not blanket permission for every downstream use, verified file compatibility, full history or live access. Preserve source permissions and apply the ordinary product/privacy review before any real-data release.

## Future API gate

Before provider-specific API development, obtain written scope covering shared display, other users, hosting, retention and intended commercial use. Verify actual supported entity/wrapper, read-only scopes, egress restrictions and approval conditions at that time. Record T1/T2 evidence privately, with only non-secret status references in the public register. Then plan reconciliation against approved statements without executing a trade.

No approved instrument universe is inferred from “non-crypto investing”. Real source capabilities and data coverage must be explicit; not every investment method has an API or CSV representation. Generic contracts and synthetic fixture design remain independent of the live gate.

## Task disposition

Task 0.3 records the permission boundary for the CSV-first build. Approval procurement and provider-specific work remain held for a separately authorised direct-broker implementation; neither is required for generic manual/CSV development. T1/T2 remain missing, not waived or passed. This step's acceptance is the explicit current/future boundary, preserved ownership/data constraints and recorded gates. No permission request has been sent.
