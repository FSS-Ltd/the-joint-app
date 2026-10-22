# Scope baseline

Date: 23 October 2026. Implements Task 0.1 discovery; does not complete Phase 0.

## Product and users

UK-first household finance for two independently authenticated adults, with parent-managed child profiles explicitly deferred until post-MVP. GBP reporting and Europe/London calendars remain planning defaults, not confirmed source-account facts. Current/savings accounts, provider-managed spaces and stock investments are the requested categories. Unsupported products remain visibly unverified.

The manual foundation covers privacy, records/imports, spending, budgets and export. The connected founder release additionally requires approved live sources, reconciliation, reproducible projections, local companion evidence and recovery. Public mobile launch additionally needs physical-device, billing/store, privacy, integration-rights and commercial gates. No narrower prototype is labelled the full MVP.

## User interface direction

All product UI is mobile first and follows [the reference synthesis](design-direction.md). Start with a usable 360px layout, then add density for tablet and desktop. Premium, minimal and family-oriented means calm hierarchy, warm neutral surfaces, individual agency and clear sharing—not decorative finance dashboards or competitive spending scores.

## Boundaries

Account data is cloud-backed; local AI inference is separate and optional until its delivery phase. Calculations stay deterministic. The app neither trades nor moves money. No source credentials enter clients, fixtures or public documentation. A savings/child space must not duplicate its parent account's value.

No cloud resources, paid contracts, provider applications, model downloads or real finance ingestion are part of this discovery step. Provider-specific development remains gated by the source specifications. Initial private inventory inputs are recorded; remaining exact source facts are activation checks. No provider coverage or permission is claimed.

## Delivery order

B0 is merged: PR #1, merge `fb79c8a23af3c590857f4d03d92385c1cb367cd9`; its final Foundation checks succeeded at head `fca0bd88f965ddde1eecba9b33320e7a0ea22b36`.

Current step is Task 0.1: inventory and agreed scope, including the requested visual direction. It receives its own PR. Complete missing evidence and obtain a passing current revision and confirmed merge before beginning Task 0.2. Retain each later numbered task as a separate delivery unit; do not combine the Phase 0 tasks to bypass the gate.

## Scope decision — 23 October 2026

Child profiles, child-specific screens and child-specific projections move to post-MVP by explicit founder instruction. Their existing specifications are retained as future design material. MVP source handling must still avoid counting verified child-earmarked funds as adult spendable money or counting spaces twice. No child login, profile, navigation item or advertised child feature is required for MVP.

Non-crypto investing is intended. Support remains source/product-specific and read-only; this is not an instruction to add every asset adapter, derivatives, leveraged trading or money movement. Account wrappers and permissions are verified before the relevant source activates. An empty investment account must not display invented holdings/history.

Task 0.1 records reported owner/operator categories and candidate manual/import routes. Remaining currency/wrapper/export facts are explicit onboarding gates, rather than an artificial requirement for live verification during initial discovery. Up to 12 months is a proposed import default, not a founder-confirmed history requirement. The step still requires current-revision CI, review and merge before progression.
