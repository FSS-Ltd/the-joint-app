# 06 — Paywalls, household subscriptions and mobile launch

> **CSV-first MVP revision, 23 October 2026:** Direct bank connections and bank procurement are post-MVP by founder instruction. The current MVP uses CSV/manual records; historical live-bank prerequisites and live-refresh paywall promises below are deferred. Provider evidence remains required before future live work. No live broker connector is included in the CSV-first build; its separate permission gate remains. See the [canonical scope revision](01-product-specification.md).

**Research checked: 22 October 2026.** This is a proposed product and engineering specification. Prices, costs and conversion assumptions are hypotheses; no subscriptions, provider contracts or regulatory permissions have been purchased or obtained. “Verified” below means supported by the linked official documentation on this date. Store policies, vendor terms and law must be checked again before release.

## 1. Commercial decision

Launch two public plans: **Free** and **Household Plus**. Both include one household with two separate adult logins. Charge for useful automation and planning, not the second adult or access to their existing records.

| Plan           | Provisional price          | Proposition                                                                                                                              |
| -------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Free           | £0                         | Complete manual household tracking, collaboration, readable history and export.                                                          |
| Household Plus | £5.99/month or £59.99/year | Supported bank and broker refresh, advanced scenarios, automation and the compatible local AI companion. One payment covers both adults. |

Annual billing is a single £59.99 payment. These are UK consumer-price hypotheses, subject to tax review, storefront configuration, provider quotes and willingness-to-pay research. Monthly and annual purchases unlock identical capabilities. Do not introduce separate AI, partner, investment or child tiers at MVP.

Offer a synthetic-data demonstration and the permanent Free plan. **Do not assume a free live-connection trial:** production provider costs and permitted trial arrangements must be known first. Local AI is optional and initially depends on a compatible Mac companion. It is not a promise of on-device or offline inference on every phone.

## 2. Exact paywall matrix

“Uncapped” means no commercial record-count limit; normal security, upload-size and abuse controls still apply equally. Free household collaboration includes syncing permitted manual changes between the two adults. This is distinct from paid refresh of external financial providers.

| Surface/action                                                              | Free                                                  | Household Plus                                                           | After Plus expires                                                                                                         |
| --------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Household membership and shared dashboard                                   | One household, two adults                             | Same                                                                     | Both adults remain members; existing access grants remain in force.                                                        |
| Manual accounts, transactions and CSV imports                               | Uncapped                                              | Same                                                                     | Continue creating and correcting manual records.                                                                           |
| Spending categories, budgets and basic reports                              | Uncapped manual use                                   | Same, plus enabled automation                                            | Basic reports and all history remain available.                                                                            |
| Manual savings goals, assets, liabilities and net worth                     | Uncapped                                              | Same                                                                     | Continue manual updates and historical charts.                                                                             |
| Manual investment and child-portfolio records                               | Uncapped parent-managed records                       | Same, plus permitted connectors                                          | Records remain editable; no child login is introduced.                                                                     |
| Connect bank, reconnect for refresh, run external bank refresh              | Zero active bank authorisations                       | Up to **four** active authorisations per household                       | Paid refresh stops; imported history remains readable and exportable.                                                      |
| Connect direct broker and refresh                                           | Zero                                                  | Up to **two**, only where written permission, coverage and pricing allow | Same preservation and suspension behavior as banks.                                                                        |
| Basic zero-growth, fixed-contribution goal date                             | Available with manual goals                           | Same                                                                     | Remains available.                                                                                                         |
| Create or run an advanced what-if scenario                                  | Zero new runs; synthetic example available            | Enabled                                                                  | Saved inputs/results remain readable and exportable under current data permissions; new runs and recomputation are locked. |
| Create or run automatic categorisation rules and scheduled insights         | Zero automation runs; manual categorisation available | Enabled                                                                  | Rules remain visible and deletable; execution pauses.                                                                      |
| Pair companion for AI, start AI session, request new AI analysis            | Zero new sessions                                     | Enabled on supported companion setup                                     | Existing permitted conversations/results remain readable; generation stops.                                                |
| Privacy settings, revoke sharing, disconnect provider, delete account       | Always available                                      | Always available                                                         | Always available.                                                                                                          |
| Export records, access requests, subscription management, restore purchases | Always available                                      | Always available                                                         | Always available; no payment or renewal required.                                                                          |

A bank authorisation is a provider connection for **one institution and one consenting adult**, not one account. Several accounts may sit behind one authorisation; two adults at the same institution can consume two slots. Deduplicate a shared account in the ledger without assuming that it removes either authorisation or its cost. Broker connections use the corresponding provider-and-consenting-adult boundary. These caps are household totals, never per-seat quotas.

Investment and child-portfolio features store and explain records. They do not place trades, move money, open investment accounts or establish beneficial ownership. Keep provider-backed prices and licensed market data out of advertised benefits until coverage and redistribution rights are confirmed. In particular, do not advertise Trading 212 connectivity before the required written permission and commercial-use agreement are obtained; its terms restrict commercial services, require consent for third-party applications and customized interfaces, and constrain redistribution. The integration feasibility register is authoritative. [Trading 212 API terms][T1]

Place the paywall after an explicit gated action: **Connect bank**, **Connect broker**, **Run scenario**, **Enable automation**, or **Ask companion**. Opening an account, budget, saved scenario, conversation or export never triggers a blocking upgrade modal. At a connection cap, offer management of existing connections and manual entry; do not promise an unpublished higher tier.

The paywall must state the total price, billing period, automatic renewal, included adults, connection caps, cancellation route and any hardware dependency. Fetch localized store prices from the billing system. Show the annual charge prominently, even when displaying a monthly equivalent. Make dismissal and Restore Purchases visible. Show actual supported institutions before purchase, and exclude unavailable connectors from benefit claims.

## 3. Billing route by platform

**Verified:** Apple requires in-app purchase for paid digital functionality, with defined exceptions. Its multiplatform provision permits access to subscriptions bought elsewhere when those features are also available through in-app purchase. The US storefront permits external purchase calls to action without the relevant entitlement; this does not establish the same permission for UK iOS. A household finance tool should not assume eligibility for the reader-app exception. [Apple review rules][A1]

**Verified:** Google includes financial-management software within its digital billing policy. Its UK Billing Choice programme became available on 30 June 2026: enrolled apps may offer an alternative billing flow or external web links alongside Google Play Billing, subject to programme implementation, reporting, support and other requirements. Participation is optional. [Google payment policy][G1] [UK Billing Choice][G2]

| Surface             | Initial product decision                                                                      | Later option requiring separate review                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Next.js web/PWA     | Stripe Billing with hosted Checkout and Customer Portal.                                      | Additional markets after tax and consumer-law review.                                                           |
| UK iOS Expo app     | Apple auto-renewable subscriptions; sign in to an existing paid household; restore purchases. | Only specifically applicable, approved regional alternatives. No general UK “pay on our website” checkout link. |
| UK Android Expo app | Google Play Billing subscriptions; same household entitlement.                                | Enrol in UK Billing Choice if its incremental savings justify reporting, payment and support complexity.        |
| Other storefronts   | No launch assumption beyond the approved UK scope.                                            | Review each storefront’s rules and local obligations before enabling sales.                                     |

Use storefront and programme eligibility, not IP address alone, to determine allowed payment UI. Keep regional purchase configuration versioned on the server. A subscription-management destination must not become an accidental prohibited purchase funnel. Existing web subscribers can use their approved household access; the launch design still supplies the appropriate native purchase option.

Model the monthly and annual iOS products in one subscription group at the same benefit level; use equivalent Google base plans and one Stripe Product with two Prices. Confirm exact change-of-period timing in each system rather than inventing identical proration rules across stores. [Apple subscriptions][A2]

## 4. Entitlements and enforcement

**Decision:** use RevenueCat to normalize mobile subscription events and imported Stripe Billing purchases, with the application backend holding the authoritative household capability view. RevenueCat documents both cross-platform customer state and Stripe purchase import. It does not replace household authorization. [RevenueCat identity][R1] [Stripe integration][R2]

Keep these concepts separate:

| Record                     | Required responsibility                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Billing identity           | Stable opaque purchaser UUID; verified mapping to provider customer/subscription IDs. No email-based ownership.                                                 |
| Subscription               | Source, environment, external transaction ID, product, purchaser, household binding, status, paid-through time, grace expiry, renewal state, last verification. |
| Household entitlement      | Capability keys, connection caps, effective interval, provenance and version, derived from valid subscriptions or explicit administrative grants.               |
| Membership and data grants | Which adult may access which records, sources, scenarios and exports; independent of payer identity.                                                            |
| Billing event/audit        | Provider event ID, verification outcome, effective time, processing state and resulting entitlement change.                                                     |

Canonical capability keys are `finance.manual`, `projections.basic`, `connections.bank`, `connections.broker`, `projections.advanced`, `categorisation.automation` and `insights.local`. Free grants the first two; Plus grants all. Caps are `bankAuthorisations=4`, `brokerConnections=2`, `companionDevices=1`.

One verified subscription activates both household members. The partner does not share the purchaser’s store credentials or RevenueCat identity. The payer receives no additional permission to view the partner’s private accounts. Do not automatically transfer a subscription when someone changes household, restores on another login or leaves a partnership. App-level household sharing is the MVP mechanism; leave optional store-family sharing disabled until its identity and capacity effects have been reviewed.

Validate paid actions in every API handler and background worker: authenticated identity, active household membership, resource grants, current entitlement, provider availability and connection cap. Enforce caps transactionally, including concurrent connection attempts. Check again immediately before a paid provider call or queued scenario run. Return a structured `ENTITLEMENT_REQUIRED` or `CONNECTION_LIMIT_REACHED` response that preserves unsent user input.

Clients may cache entitlements to present the UI, but cannot set them. Web checkout success, an SDK callback, a local `isPro` flag or a claimed household ID never authorizes backend access. Use restricted server credentials; no billing or connector secret ships in the PWA, Expo bundle or Mac client.

Process authenticated, signature-verified webhooks into a durable idempotent queue. Reject production grants from sandbox events. Deduplicate provider event IDs, fetch current subscription state when resolving changes, and prevent late events from overwriting newer effective state. Run reconciliation at least daily and around expected expiry; alert on unprocessed events and discrepancies. RevenueCat and Stripe both document server notifications for maintaining subscription state. [RevenueCat webhooks][R3] [Stripe lifecycle events][S1]

On app launch, foreground, sign-in, household change, purchase and restore, refresh backend entitlements. Push updates to the other adult’s active session. A network failure must not turn an unknown subscription into a confirmed expiry: retain permitted cached history, show verification pending, and retry. New server-costing work requires valid server state. A device-session or entitlement metadata token may last at most 24 hours and never beyond the verified entitlement end, but it does not authorise offline processing. Every AI job requires fresh online execution permission and a renewable lease no longer than five minutes, plus current checks before completion and viewing. Revocation cannot claw back evidence already disclosed.

### Founder access

Give the pilot household an administrative `founder_test` grant attached to their household, with named issuer, reason, capability set, issue date and expiry no more than 90 days away. Renewal is a logged administrative action; audit grants monthly and before public launch. No email allowlist, hidden production screen or client bypass. Founder grants never bypass provider permission, data-access checks or cost budgets. Expiry returns the household to Free without charging a card or deleting records.

## 5. Subscription lifecycle and household edge cases

The following is application behavior. Provider state remains authoritative for payment and entitlement timing. Google’s documented lifecycle distinguishes grace, account hold and expiry, and requires timely acknowledgement of successful new purchases; configure and test this through the chosen billing integration. [Google lifecycle][G3]

| Event/state                                                    | Required behavior                                                                                                                                                                 |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purchase pending, cancelled checkout or unverified transaction | Do not grant Plus. Display pending or cancelled accurately; allow recovery without paying again.                                                                                  |
| Verified initial purchase or renewal                           | Grant through the verified effective period. Acknowledge/finish required store transactions; record source and renewal information.                                               |
| User cancels auto-renewal                                      | Keep Plus until the paid-through date. Show “Ends on …”; never immediately disconnect banks solely because renewal is off.                                                        |
| Provider-recognized billing grace                              | Retain Plus through verified grace expiry and offer the source-specific payment-repair route.                                                                                     |
| Account hold, paused service or expiry without grace           | Suspend new paid work. Return to the Free matrix while preserving data.                                                                                                           |
| Refund or revocation                                           | Apply the provider’s verified effective access change. A refund does not by itself prove future renewal is cancelled; show the actual state.                                      |
| Restore/reinstall/new device                                   | Verify the existing purchase and its original identity binding. Restore access without creating a second charge; resolve ownership conflicts without silently merging households. |
| Resubscribe                                                    | Reuse retained records; refresh permissions and reconnect providers where consent or credentials have expired.                                                                    |
| Monthly/annual change                                          | Use the provider’s supported change flow, display effective date, and follow its verified transition.                                                                             |

Provide Restore Purchases and Manage Subscription in Settings. Route cancellation, payment repair and refund requests to the correct source; a non-purchasing partner sees the household benefit and billing-source information without the payer’s payment details. Web subscriptions use the Stripe portal. Native subscriptions use the appropriate store-management flow.

Before checkout, query all known household subscriptions under a server-side purchase-intent lock. If any is active, offer management instead of another purchase. Cross-store or two-adult races can still produce duplicates: detect them after verification, show both billing sources, prevent benefits/caps from stacking, and provide a clear refund/cancellation support route. Never invent a refund outcome or silently cancel a different person’s subscription. One transaction can fund only its verified household binding.

At effective downgrade, stop polling, queued refreshes, automation and new AI/scenario jobs. Unsubscribe or disconnect provider resources where needed to stop ongoing charges; show whether a fresh bank consent will be required to resume. Preserve imported history with its last-successful-sync timestamp. Continue manual entries and annotations, with provenance that prevents duplicate imports on reconnection.

Saved scenario results remain readable only under **current** source grants. Sharing revocation must invalidate dependent results and caches even if the result was created while paid. Regenerate a result for the remaining scope if appropriate; do not rely on string-redacting an AI narrative. Privacy invalidation and necessary safe recomputation are never paywalled. Privacy redaction, deletion and export are free. Retaining an old calculation is not a perpetual grant to another adult’s private information.

Leaving a household, revoking access, account deletion and subscription cancellation are distinct operations. Explain the effect on both adults and the billing source. Do not require payment, partner approval or renewal to exercise privacy rights. Deleting the payer must not silently transfer billing or erase the other adult’s independently owned records; apply the reviewed joint-record deletion policy and retain only justified billing/audit information.

## 6. Privacy, account deletion and UK release gates

**Verified store requirements:** Apple requires account-deletion initiation within an app that supports account creation. Google requires an in-app deletion path and an outside-app web resource. Apple also describes warning subscribers about continuing store billing and permits immediate deletion even when offering deletion at subscription end. Implement Settings → Privacy → Delete account plus a public deletion page, identity verification, status and completion confirmation. Cancellation guidance must not obstruct deletion. [Apple deletion][A3] [Google deletion][G4]

Apple privacy disclosures include integrated third-party practices; Google requires accurate Data safety answers. Build disclosures from the actual data-flow inventory: financial records, identifiers, purchases, diagnostics, notifications, provider tokens and AI traffic. Include RevenueCat, Stripe, hosting, crash tools and connector suppliers. Minimize logs and use synthetic review accounts. Apple requires disclosure and explicit permission before sharing personal data with third-party AI; a future hosted fallback therefore needs a separate consent decision. [Apple privacy][A4] [Google Data safety][G5] [Apple review rules][A1]

“Local AI” describes where inference occurs, not an assertion that the entire app collects no data. Explain Mac pairing, transport, storage and connectivity requirements. Do not claim bank refresh works offline. Kids portfolios are adult-managed records; use minimal identifiers, no child credentials and no marketing to children. The ICO’s Children’s Code can apply where children are likely to access a service, so an adult-facing design still needs a documented applicability assessment. [ICO Children’s Code][L1]

The following are **release gates**, not claims that this plan confers compliance:

- **Open banking:** obtain written advice on the app’s regulated perimeter and its relationship with the chosen authorized/registered provider. The FCA treats account-information services as regulated activity; a read-only label or aggregator contract alone does not establish exemption. Verify responsibilities, consent, insurance requirements where applicable, complaints and permitted commercial use. [FCA AIS][L2]
- **Data protection:** document lawful bases, processor agreements, retention, access controls, international transfers, incident handling, rights requests and whether a DPIA is required. Erasure rights have qualifications; the ICO also flags its guidance as under review following legislative change. Do not promise blanket immediate erasure of every legally retained record. [ICO erasure][L3]
- **Consumer contracts:** review pre-contract terms, reminders, cancellation, cooling-off rights and refund handling for the launch date and billing channel. The GOV.UK guidance published 19 October 2026 is explicitly **draft**: it describes 1 January 2027 application to new contracts, while noting parliamentary approval remains necessary. Do not present that draft as already operative law, or assume a SaaS service automatically qualifies for a digital-content cancellation waiver. [Draft guidance][L4]
- **Store/entity review:** determine the appropriate legal-entity enrollment, review account, finance declarations and supporting provider permissions. Apple identifies sensitive-information and financial-service apps as requiring legal-entity submission. Recheck current store requirements immediately before phase 5. [Apple review rules][A1]

## 7. Unit economics and connector ceiling

**Verified fee context:** Apple’s Small Business Program offers a 15% commission for qualifying enrolled developers. Outside it, Apple describes 70% proceeds during a subscription’s first paid year and 85% thereafter, less applicable taxes. Google’s current UK schedule specifies a 10% service fee for auto-renewing subscriptions plus 5% when Play Billing processes payment; alternative billing retains the service fee and adds the developer’s own processing costs. [Apple small business][A5] [Apple subscriptions][A2] [Google fees][G6]

The UK standard VAT rate is 20%; whether and how it applies to this business and each channel requires accounting review. The table is a **sensitivity calculation**, not a tax determination or a statement of exact store settlement mechanics. [UK VAT rates][L5]

| Illustrative deductions                                                        | £5.99 monthly: receipts/month | £59.99 annual: receipts/month |
| ------------------------------------------------------------------------------ | ----------------------------: | ----------------------------: |
| 20% VAT removed, then 15% store deduction                                      |                         £4.24 |                         £3.54 |
| 20% VAT removed, then 30% store deduction                                      |                         £3.49 |                         £2.92 |
| No VAT deduction, 15% store deduction                                          |                         £5.09 |                         £4.25 |
| Web: 20% VAT; invented processing assumption of 2% of gross + £0.20 per charge |                         £4.67 |                         £4.05 |

The web row is deliberately an assumption, **not a Stripe quote**. Add actual Billing, RevenueCat, tax tooling, currency, dispute and refund costs. Do not deduct the same processor fee again from a store-payment row. Google Billing Choice needs its residual Play fee in addition to web processing; the standalone web row does not model that programme.

For monthly modelling, define `G` as gross subscription receipts, `v` as the applicable tax fraction, `s` as the relevant percentage fee on the assumed net base, `P` as other processing/billing costs, `C` as connectors, `O` as other variable operations, and `F` as fixed overhead:

`Operating contribution = G / (1 + v) × (1 − s) − P − C − O − F`

Reconcile this planning formula to actual settlement statements. Annual cash collected upfront is not twelve months of immediately earned profit; recognize revenue and continuing service obligations over the term. Founder salary, acquisition spending, exceptional support, professional advice and business taxes still require funding.

Connector quotes must expose the charging unit: active end user, institution authorisation, account, refresh/request, broker connection, minimum monthly commitment and overage. Two adults can create two billed users. Four bank authorisations plus two brokers are a product allowance, not a promise that six costs are negligible. Apply only the charging units in the actual contract, avoiding double counting.

Use planning ranges of **£60–140/month** fixed founder infrastructure and **£120–350/month** at 100 paying households, excluding connectors and transaction fees. These are estimates. At 100 annual subscribers under the 20%/15% illustration, receipts total approximately £354/month. Assume another £0.50 per household for incremental operations/reserves, excluding connectors and any fees not already modelled:

| Fixed infrastructure | Remaining connector budget at break-even | Connector budget retaining 20% of receipts before founder pay/tax |
| -------------------- | ---------------------------------------: | ----------------------------------------------------------------: |
| £120/month           |                    £1.84/household/month |                                             £1.13/household/month |
| £350/month           |           Negative £0.46/household/month |                                    Negative £1.17/household/month |

At the lower-cost case, the supplier’s combined bank/broker/user/request charges and allocated minimum must fit approximately **£1.13 per household per month** to meet that illustrative 20% contribution target. At the upper-cost case, this price fails before any connector expense. Measure average and high-usage households, annual-plan mix, free-household costs, churn and provider minimums. If quotes fail, renegotiate, reduce infrastructure, revise the connection allowance before sale or test a higher price. Do not subsidize an unbounded connectivity promise or rely on unverified free production access.

## 8. Phase and release acceptance

Phase 0 resolves provider permissions, indicative quotes and billing/legal feasibility. Phase 1 builds the Free manual foundation and entitlement boundary. Phase 2 adds approved connections and cost telemetry. Phase 3 adds wealth records and permission-aware projections. Phase 4 supplies the founder MVP with the local Mac AI companion. **Phase 5 delivers Expo iOS and Android before public paid MVP**, with platform-native billing and the same backend grants as the web app.

Before charging public users, demonstrate purchase, renewal, cancellation, grace, hold, expiry, refund/revocation, restore, device reinstall, duplicate billing and late/replayed webhook handling in isolated test environments. Verify a paid adult plus unpaid partner on different platforms, a revoked source inside a saved scenario, and a downgraded household’s complete export. Confirm no paid worker runs after expiry and no checkout redirect grants access.

Complete real-device pairing and lost-connectivity checks, accessibility and price-copy review, store privacy declarations, public account-deletion flow, provider consent/revocation and an actual gross-to-settlement reconciliation. For Stripe, use separate development/test sandboxes, Billing plus Checkout and lifecycle webhooks; confirm tax registrations and product treatment before enabling automated tax collection. This is a plan, so none of these production or sandbox checks is claimed complete. [Stripe subscription design][S2] [Stripe tax setup][S3]

## Official sources

All checked **22 October 2026**. Product decisions above are proposals; source links substantiate platform, supplier and regulatory facts.

| Topic                | Official references                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple                | [Review guidelines][A1]; [subscriptions][A2]; [account deletion][A3]; [privacy disclosures][A4]; [Small Business Program][A5].                                |
| Google Play          | [Payments policy][G1]; [UK Billing Choice][G2]; [subscription lifecycle][G3]; [account deletion][G4]; [Data safety][G5]; [service fees][G6].                  |
| Billing architecture | [RevenueCat identity][R1]; [Stripe integration][R2]; [RevenueCat webhooks][R3]; [Stripe subscription events][S1]; [subscription design][S2]; [tax setup][S3]. |
| Connector permission | [Trading 212 API terms, particularly §§4, 6 and 7][T1].                                                                                                       |
| UK release review    | [Children’s Code][L1]; [FCA account-information services][L2]; [ICO erasure guidance][L3]; [draft subscription-contract guidance][L4]; [VAT rates][L5].       |

[A1]: https://developer.apple.com/app-store/review/guidelines/
[A2]: https://developer.apple.com/app-store/subscriptions/
[A3]: https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion
[A4]: https://developer.apple.com/app-store/app-privacy-details/
[A5]: https://developer.apple.com/app-store/small-business-program/
[G1]: https://support.google.com/googleplay/android-developer/answer/10281818?hl=en
[G2]: https://support.google.com/googleplay/android-developer/answer/17161464?hl=en
[G3]: https://developer.android.com/google/play/billing/lifecycle/subscriptions
[G4]: https://support.google.com/googleplay/android-developer/answer/13327111?hl=en
[G5]: https://support.google.com/googleplay/android-developer/answer/10787469?hl=en
[G6]: https://support.google.com/googleplay/android-developer/answer/112622?hl=en
[R1]: https://www.revenuecat.com/docs/customers/identifying-customers
[R2]: https://www.revenuecat.com/docs/web/integrations/stripe
[R3]: https://www.revenuecat.com/docs/integrations/webhooks
[S1]: https://docs.stripe.com/billing/subscriptions/webhooks
[S2]: https://docs.stripe.com/billing/subscriptions/design-an-integration
[S3]: https://docs.stripe.com/tax/set-up
[T1]: https://www.trading212.com/legal-documentation/API-Terms_EN.pdf
[L1]: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/introduction-to-the-childrens-code/
[L2]: https://www.fca.org.uk/firms/account-information-services-payment-initiation-services
[L3]: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/
[L4]: https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf
[L5]: https://www.gov.uk/vat-rates
