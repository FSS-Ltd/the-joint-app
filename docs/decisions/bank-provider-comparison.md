# Task 0.2 — Bank provider comparison

Checked: 23 October 2026. Status: research retained; bank procurement deferred post-MVP by founder instruction. No supplier contacted, account opened, contract signed, key obtained or real-data request performed.

## Decision

Evaluate TrueLayer Data v3 first, Plaid Custom second. Enable Banking remains conditional on written UK coverage/use-rights confirmation. No production provider is selected: B1–B3 in [the gate register](provider-gates.md) lack evidence. The MVP uses CSV/manual records. This document does not approve a connector. Task 0.2 now records the explicit procurement deferral rather than requiring supplier approval before the manual build.

## Evidence and trade-offs

| Candidate         | Verified primary-source facts                                                                                                                 | Unresolved product/procurement facts                                                                                                                | Disposition                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| TrueLayer Data v3 | UK-supported Data product with scoped connection IDs and hosted authorisation. Documentation limits custom end-user flows to regulated AISPs. | Exact retail/savings/space coverage; recurring household-budgeting acceptance; approved AIS relationship; history depth; renewal; commercial quote. | First enquiry. Prefer hosted consent if accepted; mobile-first application styling does not justify rebuilding regulated consent. |
| Plaid             | Billing documentation says UK/EU-based customers or UK/EU end users require Custom plans. Custom pricing requires a supplier conversation.    | Transactions coverage per exact product; minimums and charging units; two-adult billing; production eligibility and AIS relationship.               | Alternative enquiry; do not assume the advertised general Trial or Pay-as-you-go plans apply to this UK use case.                 |
| Enable Banking    | Linked-account restricted production is documented for evaluation and individual non-commercial use; public apps require an agreement.        | Actual UK institution/product coverage, applicable permissions, partner-display rights and future commercial agreement.                             | Conditional candidate. Own-account whitelisting is not evidence of a permitted shared household service.                          |

The FCA distinguishes AIS agent and technical-service-provider models. A displayed household dashboard cannot assume its own legal role merely because an aggregator supplies data. Obtain an approved description of the contracting entity, consumer relationship, consent, disclosures, responsibilities and any required registration before live use. This is an unresolved review requirement, not a legal conclusion about this app.

## What must be compared in writing

For each candidate record country, institution, exact retail product, current/savings/space coverage, consenting adult, scopes, booked/pending semantics, history depth, refresh limits, renewal/reconnect flow, revocation and deletion rights. Confirm whether spaces are separately identified and whether their values are included in the parent balance. Keep the household institution-to-owner matrix private.

Obtain a quote for one household/two consenting adults and hypothetical 100/1,000-household scenarios. Require the actual charging unit (user, authorisation, account, connection or request), minimums, setup, enrichment, refresh/reconnect costs, taxes, term, support and exit/data-retention conditions. These scenarios are planning volumes, not existing users or a sales forecast. No provider price, margin or budget approval is inferred from public pages.

## Primary sources

Reviewed on 23 October 2026; recheck at supplier selection and before live activation.

- [TrueLayer Data v3 connection flow](https://docs.truelayer.com/docs/enable-your-users-to-connect-their-bank-account).
- [Plaid pricing and billing](https://plaid.com/docs/account/billing/).
- [Enable Banking linked accounts](https://enablebanking.com/docs/api/linked-accounts).
- [Enable Banking FAQ](https://enablebanking.com/docs/faq/).
- [Enable Banking terms](https://enablebanking.com/terms/): search index surfaced use restrictions, but full terms did not render in the reading tool. Do not rely on the indexed extract as contract clearance; obtain the supplier's current agreement.
- [FCA AIS models](https://www.fca.org.uk/firms/agency-models-under-psd2).

## Acceptance and next action

Current Task 0.2 acceptance: preserve research, record direct bank connections as post-MVP and retain B1–B3 as unmet future activation gates. No supplier approval, outreach or quote is required to build the CSV/manual MVP. The founder's 23 October scope instruction supersedes the previous current-step procurement requirement.

Before future bank work begins, reopen procurement and require the actual production path, permitted scope, exact product coverage and quoted billing units. Public docs/sandbox access are insufficient. Obtain authorization for any supplier communication, application or spend. Do not publish household institution-to-owner mappings.
