# Category spending caps and savings feedback

**Status:** Product requirement accepted on 2026-10-23; implementation pending. This extends existing monthly category budgets, not a second budgeting system. It does not reopen completed Task 1.5 or mark any new build gate complete.

**Delivery:** Include in Phase 3 Task E's budget/goal experience, after the relevant goal funding and projection foundations have their own verified PR/CI/merge gates. Keep the current Task 3C.2 delivery separate from feature implementation. Everything remains local; no deployment before the entire MVP is complete and explicit approval is given.

## Monthly category caps

Let authorised adults set or edit a calendar-month cap for a category, such as **£50 for eating out**. Reuse the existing category, budget scope, versioning, booked-spending and refund rules. Both the cap and actuals must refer to the same currently authorised account scope; household membership or shared goal details do not expose private spending.

Show the cap, spent amount and amount remaining prominently in a mobile-first layout. A progress indicator should make the remaining allowance easy to scan. This is a money countdown updated from imported/manual evidence, not a timer or a claim of live bank connectivity. Display the source period, last update and incomplete-history state.

| Synthetic example       | Required presentation                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| £50 cap, £35 spent      | **£15 left**; normal budget state and clear progress.                                                                           |
| £50 cap, £50 spent      | **£0 left · Limit reached**; steady red emphasis.                                                                               |
| £50 cap, £65 spent      | **£15 over your limit**; red emphasis and a brief, gentle pulse when the overspend changes. Preserve the exact signed variance. |
| No cap set              | **No cap set** with a clear action; never imply a zero allowance.                                                               |
| Partial imports/history | Label the displayed remainder as based on available records; do not present it as confirmed spare money.                        |

At or beyond the cap, text and an accessible status label must communicate the state without colour or motion. Keep amounts legible and static; pulse a surrounding indicator rather than flashing the numbers. Use a short pulse that settles to steady red, respect `prefers-reduced-motion`, and avoid continuous or rapid flashing. Preserve keyboard access, visible focus, touch targets and an equivalent numeric/table view. Use the established premium, minimal family palette and the local Design references when this screen is implemented; avoid punitive or shaming copy.

Calculate money exactly in minor units. Reclassification, splits, refunds, cap edits and new imports recompute the state using existing financial rules. Own-account transfers and card repayments must not count twice as category spending. A capped progress graphic may stop at its visual boundary, but it must not hide the exact overspend. A zero cap and net-refund month need explicit, truthful states.

## Show the effect on savings

Connect overspending to the user's confirmed monthly savings/contribution plan using deterministic arithmetic and the same permitted source scope. Explain the effect without changing actual balances, existing allocation intentions or observed transactions.

For example, **if everything else stays as planned**, £15 of additional category spending against a confirmed £200 monthly savings plan leaves **£185 available for that planned contribution**. Label this as a budget scenario, not proof that a savings balance fell or that money has moved. Show the category variance and the net effect across the selected budget scope; offset eligible underspends before presenting a household total, and do not subtract the same overspend from every goal.

Where sufficient confirmed income, remaining commitments, bill reserves or current source evidence are missing, show that the effect cannot yet be confirmed. Do not infer disposable cash from a budget cap alone. If the goal projection engine has suitable authorised inputs, optionally show the resulting change to the goal timeline with assumptions visible; otherwise show the amount effect without inventing a goal date or investment return. Preserve an explicit shortfall if the plan is unfunded.

## Month-end encouragement

When the month is closed and coverage is sufficient, acknowledge underspending with supportive copy, for example: **“You finished £15 under your eating-out plan. Would you like to put some towards a savings or investment goal?”**

Offer a user-selected amount and an existing permitted savings/investment goal. Confirm the source, destination and remaining commitments before recording a plan or eligible goal allocation. A category underspend is not automatically available cash: respect settled adult funds, reserves, source control and other allocations. Never reuse the same leftover across several goals.

This is encouragement and an explicit planning action. Do not automatically move money, place an investment order, recommend a financial product or turn a planned contribution into an observed savings event. Actual transfers/investments remain user-managed and become recorded activity only through supported manual/imported evidence. No direct-bank connection is introduced; those integrations stay post-MVP.

Category caps, remaining amounts, straightforward savings arithmetic and month-end encouragement stay within the free manual-finance experience. An optional advanced saved scenario follows the existing explicit capability rules; ordinary budget feedback is not silently paywalled.

## Acceptance for the later build step

- [ ] Exact £50/£35, £50/£50 and £50/£65 examples show £15 left, limit reached and £15 over respectively.
- [ ] Caps can be created/edited with existing authorisation and optimistic-version rules; no-cap, zero-cap, refunds, splits, corrections and missing-history states are covered.
- [ ] Mobile and desktop, keyboard, screen-reader text and reduced-motion checks pass; no state relies on red or pulsing alone.
- [ ] £200 planned saving with £15 additional net spending shows the explicitly qualified £185 scenario; offsetting underspends and competing goals do not double-count funds.
- [ ] No confirmed savings effect, spare-cash claim or goal date appears when required evidence is unavailable or outside permissions.
- [ ] Month-end encouragement requires sufficient coverage and explicit user confirmation. Source permissions, bills/reserves, settled eligibility and allocation limits are rechecked.
- [ ] No automatic transfer, trade, observed contribution, connector activation or deployment occurs.
- [ ] Deliver the enhancement as its own locally verified build step and PR; current-revision CI and host-verified merge are required before progression.
