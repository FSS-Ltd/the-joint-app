# Task 0.1 — Household account inventory

Date: 23 October 2026. Status: discovery in progress; actual account details are private.

The household supplied its bank/broker names and initial product categories. The local inventory is stored in ignored `docs/private/account-inventory.md`. It contains no account numbers, balances, access keys or passwords. It must not be copied into public issues, CI fixtures or PR descriptions.

## Recorded categories

The initial scope includes current accounts, savings, provider-managed savings spaces, a child-designated space, and stock investments. Product-level connectivity, legal ownership, currencies, history depth and import routes are not yet verified. All connectivity records are `unverified`; default partner visibility is NONE.

A provider space must be represented distinctly from its parent account. Do not add its value to a parent balance without verifying whether the parent includes it. Child designation does not prove child legal ownership, guardianship or liquidity. These facts must be confirmed before data modelling or live imports count toward acceptance.

## Remaining evidence

- Confirm adult/joint/child legal owner and managing authority for each product.
- Confirm currencies, investment product/entity, liquidity/restrictions and intended sharing.
- Confirm desired history, available exports and permitted import/connectivity route per product.
- Compare exact product coverage against the approved provider route in Task 0.2; do not infer coverage from a bank name.

## Acceptance and handoff

Task 0.1 is not complete until each requested product has verified ownership, data requirements and a proposed import/connectivity route. Unknown is not approved or manual-only. Synthetic manual work is the intended development path once the applicable delivery and Phase 0 entry gates pass; no live integration is authorised here.

Private evidence stays local while the repository is public. A future clone needs the founder to supply that inventory through an approved private channel. Public progress records track completion status without disclosing the household's institutions.
