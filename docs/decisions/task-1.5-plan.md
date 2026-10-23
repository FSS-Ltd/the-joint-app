# Task 1.5 — Spending, budgets and monthly review

Predecessor PR #11 is verified MERGED into main at `d75ff77ea17824961a748c7a40774bfb24a09c7e`. Final head `71de31add6ad2c58ce4a4d22075eb52b7e1ec875`, actual tested merge `3056888509a4e84e706cdeaadd37224496736fff`, Foundation checks SUCCESS run 39895150993. Merge evidence: https://github.com/FSS-Ltd/the-joint-app/pull/11#issuecomment-6356741794. Branch: build/1.5-spending-budgets-review.

All app execution/data stay local until the entire MVP is complete and the founder explicitly approves deployment. No hosted preview, deployment rehearsal, cloud database, direct bank/broker connection, child profile, external message or paid change. GitHub source and synthetic CI remain authorised. No Task 1.6 implementation before this step has a PR, current successful CI and host-verified authorised merge.

## Scope and design

Deliver the whole canonical Task 1.5: deterministic spending/cash-flow calculations, manual financial classifications, explicit transfer confirmation, exact category splits, calendar-month scoped budgets, history coverage, dashboard/activity filters and monthly review. Reports use only authorised BOOKED rows from published imports or manual entries. Retain source and correction history.

The actual NU.Finance and Payrix images were inspected again. Use NU.Finance's clear financial hierarchy, restrained category/trend charts and readable rows with Payrix's comfortable mobile spacing and soft opaque surfaces. Preserve evergreen/ivory/sage/apricot tokens. Build at 390px first; support 320px and a bounded two-column/rail layout at desktop. Charts have visible accessible table alternatives. No fabricated balances, goals, account connections or private-account counts.

Ruling: implement the existing task without another approval round — the founder authorised continuing the project and merging verified PRs. All new choices below are reversible local product/engineering decisions within that scope.

## Financial contract

- Classification kinds: EXPENSE, INCOME, REFUND, TRANSFER, DEBT_PAYMENT, PRINCIPAL, CONTRIBUTION and UNCLASSIFIED. An explicit owner override wins. EXPENSE requires a negative amount; INCOME/REFUND require a positive amount. Other kinds accept either nonzero direction. Zero rows have no financial effect.
- Without an explicit kind, negative CURRENT/SAVINGS/CREDIT_CARD rows are provisional EXPENSE; other rows are UNCLASSIFIED. Provisional rows remain visibly unreviewed. No positive row silently becomes salary or a refund. Investment sales/contributions and unknown loan payments are never guessed as income/consumption.
- Spending is the negated sum of EXPENSE and REFUND components. February refunds offset February category spending, even if they exceed purchases; January stays unchanged. Income, transfer inflow/outflow, debt-service outflow/settlement inflow, contribution inflow/outflow, unclassified inflow/outflow and net cash movement are separate measures with an exact reconciliation bridge.
- Source/split/budget line values retain the signed 64-bit Money boundary. Aggregate Money uses bounded canonical signed decimal strings with a larger range; summing valid rows must not overflow a source-row type. All financial arithmetic is BigInt/SQL numeric. Chart dimensions alone use a bounded integer ratio.
- Splits replace the parent in aggregation, never add to it. Two to twenty nonzero typed category components must sum exactly to the signed parent; mixed directions are allowed only when each component's kind/sign is valid. Empty lines clear splits. A split or classification records an immutable revision and advances the transaction/account version.
- A confirmed pair links two distinct owned account transactions, equal/opposite GBP amounts, no existing active link/splits and matching optimistic versions. Caller must own both accounts; household admin/detail grants do not confer write authority. A payment to a tracked credit card excludes both settlement legs while retaining purchases. Owners of separate accounts may classify their own transfer legs individually without changing a partner's source.
- Pair removal restores the prior financial kind and requires both current versions. Financial edits, financial-kind/category changes and splits are blocked while paired; notes/merchant changes remain allowed. Financial source edits are blocked while splits exist until splits are cleared. Preserve CSV financial immutability.
- Viewers receive only the visible leg's classification, never hidden counterpart identifiers, labels or amounts. Transfer read/removal details require ownership of both legs. New revision JSON contains the current account's change, not another account's metadata. Rollback protection continues to follow transaction versions/revisions.

## Reports and coverage

`GET H/reports/spending?month=YYYY-MM&accountIds=id,id` returns the requested calendar month, six-month trend, exact summary/category amounts, selected authorised accounts, coverage, calculation time and a dataset key. Omitted scope means all currently TRANSACTIONS-accessible accounts, never TOTALS/NONE. Explicit unavailable IDs yield uniform 404, not partial results. Scope is bounded to 50 accounts; if more are available, require explicit selection rather than silently truncating.

The server derives account access and membership afresh on every request. A report's dataset key depends only on actor/grant epoch, selected accounts/versions, relevant coverage/budget versions and month; hidden-account changes and other authors' private notes must not change it. No household-wide revision or hidden-account count enters a visible report. Empty eligible scope is an honest no-accounts state, not a fabricated complete zero.

Month boundaries are London calendar dates. Coverage requires an explicit owner attestation for an account/month; min/max transaction dates or a successful upload never prove full history. Current/future months are incomplete. A completed selected month is complete only when every selected account is attested and no provisional/unclassified financial rows or unknown debt-service split remain. Show missing-history/unreviewed/debt-service reasons beside affected totals. Comparisons are available only for completed, fully covered comparable periods; otherwise explain missing coverage instead of comparing a partial month to a full month.

Account-month coverage has owner-only versioned writes, TRANSACTIONS-only reads, immutable audit revisions and no private note. `PUT H/accounts/:id/coverage/:month` accepts `{complete:boolean}` plus If-Match (zero for first create). An attestation for a current/future month cannot claim completion.

Use bounded SQL grouping of authorised unsplit/split components for reports, not full-ledger responses or row-by-row permission joins. Group by month, category, account kind, raw classification, direction and reviewed state; pure domain logic consumes grouped components as well as individual fixtures. Preserve exact totals at any category cardinality: keep the most frequent 99 categories plus requested budget categories, aggregate the rest into an explicitly labelled grouped category. Never silently drop records. Counts/provenance are scoped; no private note body is fetched.

## Budgets and categories

`GET/PUT H/budgets/:month` uses the same explicit selected-account scope. One shared budget per household/month/exact scope; any current adult with TRANSACTIONS access to every account in that scope may edit planning limits. Account ownership still exclusively controls source classifications and coverage. No billing/admin override. Loss of any scope permission hides the entire stored budget; never expose a partially subtracted budget or private scope.

PUT accepts `{accountIds,lines:[{category:null|string,limit:Money}]}` with nonnegative GBP limits, at most 100 unique categories and If-Match zero/new or current version. Null means Uncategorized. A custom category remains an exact label; preserve existing owner labels rather than silently merging differently cased names. Budget lines are versioned atomically; actuals use this same authorised period/scope, with signed refund-adjusted spending and exact remaining values.

Use immutable reusable BudgetScope/BudgetScopeAccount tenant-matched relations, Budget/BudgetLine and immutable BudgetRevision. Scope publication validates 1–50 authorised accounts before any budget can reference it. A newly constructed unready scope is visible only to its creator for atomic construction; no financial figures attach until ready. Ready scope access always requires current access to every account, including for its creator. Scope membership is immutable; a different account selection is a different budget scope. Database helpers/grants must prevent cross-tenant references, vacuous empty-scope access or private-scope existence leaks.

`GET H/categories?accountIds=...` provides suggested category labels and categories used in that visible scope. It does not implement automation/rules or expose a hidden partner's labels. Activity filters add month, category and financial kind to the existing account-scoped paginated route and bind filters into its opaque cursor.

## API and UI boundary

All H routes use `/v1/households/:householdId`; fixed Next BFF routes mirror them under `/api/households/`. JSON remains bounded; origin/CSRF, strict schemas, UUID validation, safe errors, opaque sessions, live scope and no-store apply. No generic arbitrary-path proxy.

- Extend transaction annotation with nullable `classificationKind`; preserve category/merchant/private-note behaviour.
- `PUT H/transactions/:id/splits` accepts `{lines:[{category,money,classificationKind}]}` and quoted transaction If-Match; returns the effective transaction.
- `POST H/transfers/confirm` accepts `{fromTransactionId,toTransactionId,fromVersion,toVersion}` and UUID Idempotency-Key; returns `{id,from,to}` with both effective transactions. `DELETE H/transfers/:id` accepts both versions in a strict body and returns both effective transactions.
- Transaction DTO adds explicit/effective kind, confirmed/provisional state, split components and safe pair state. No hidden counterpart data in shared transaction DTOs.
- `/dashboard`, `/budgets` and `/review` are real screens with month/account scope controls. Activity includes working search/filter links and detail tools for kinds, splits and transfers. Preserve empty/loading/error/offline/pending/conflict states and owner/detail permission labels.
- Query state is keyed by actor/membership/grant-aware server scope, selected accounts and month. Abort/ignore stale responses; clear financial state on scope changes, logout, permission errors and failed refresh. Revalidate on focus. No persistent browser finance storage.
- Add a minimal local PWA manifest/static offline shell and service worker. Cache only explicitly whitelisted static shell assets; never cache authenticated HTML, API/finance responses, tokens or statements. Navigation uses network with a generic static offline fallback. API requests are not intercepted. Real browser tests inspect CacheStorage and offline behaviour.

## Implementation and acceptance

Parent: contracts and integration of API services/controllers, report/budget endpoints, source mutation safeguards, scope/version rules, documentation and delivery. Independent subtasks within this build step may own pure finance math, database schema/RLS/negative tests and mobile UI/BFF/browser tests with agreed interfaces. No subtask may begin Task 1.6.

Watch meaningful failures before implementation: £500 owned transfer yields £0 consumption; £120 card purchase plus settlement yields £120; January purchase/February refund keeps January intact; splits reconcile exactly; pending/superseded/unpublished rows excluded; aggregate values beyond int64 remain exact; unknown history is incomplete. Prove all API/SQL projections against those golden outcomes.

Real restricted-role tests cover household isolation, NONE/TOTALS detail and budget denial, partially revoked scopes, immutable splits/revisions, cross-account/actor transfer denial, stale/concurrent budget versions, coverage owner checks, rollback protection and report revisions. Use only synthetic local Auth/data. Prove 50,000-row report aggregation under the existing five-second transaction/statement budget; don't replace runtime checks with owner queries.

Run all root checks, fresh committed-source frozen install/build/types, fresh disposable database migrations/runtime setup and full integration tests. Real browser golden journey: import/create records, classify/split/confirm, budget, monthly review, partner visibility/downgrade and offline shell. Inspect actual 390/1280px images, 320px overflow, keyboard, 200% zoom, reduced motion and chart tables. Self-review and a fresh independent whole-step review precede PR creation. Merge only after current head/actual test-merge CI and repository requirements pass.

State: implementation locally verified and independently reviewed. Exact committed-source/fresh-database verification and PR/CI/merge remain pending. No next step has started.

## Verification rulings and review

Ruling: reuse the production report journey's existing 50,000 classified rows for the lower-level restricted-role SUM/count regression, instead of seeding a second identical 50,000-row dataset. The combined fixture retains the full row count, exact aggregate assertions, actual ReportService reads, category/privacy checks and unchanged five-second runtime SQL/transaction limits. Smaller 500-row maintenance seed batches avoid setup contention; no product limit, assertion or required check is relaxed. The cost if wrong is reduced independence of fixture setup, offset by the stronger shared assertions and a fresh-database full-suite run.

Whole-step review is in progress. Reproduced/fixed findings must receive targeted regression checks followed by the full suite before PR creation. Source manifest review also found the generic `coverage/` ignore hid the new API coverage route; the artifact ignore is now anchored to the root coverage output directory.

Ruling: close the enqueue/claim clock-authority mismatch exposed during regression investigation. Prisma's `now()` default supplies a host timestamp, while job eligibility uses PostgreSQL time. A deterministic Date-only host-clock offset of sixty seconds reproduced an unclaimable new job. Use a database-generated, millisecond-truncated `runAfter` default in an additive migration; leave existing rows, explicit retry schedules, claims and all deadlines unchanged. This proves and fixes the clock mismatch; it does not prove that mismatch caused every earlier intermittent fixture failure. The cost if wrong is a default-expression rollback, without changing existing schedules.

The independent whole-step review identified three UI defects: incoming-leg transfer ordering, shared viewers missing split details, and denied mutations retaining revoked report data. Each was reproduced in a real browser and fixed. Split parents now expose no misleading effective parent kind; every detail viewer sees typed component amounts. Incoming confirmation orders both IDs and optimistic versions by sign. Permission-denied mutations invalidate the parent financial view. The actual browser journey independently exercises mutation denial and focus refresh after revocation. No review findings are deferred.

Ruling: refresh cached plans only on each synthetic maintenance seed connection before its 500-row insert transaction. Session-local nested-query profiling proved that plans cached with ten rows scanned 50,009 rows after abrupt fixture growth, including PostgreSQL's own foreign-key lookup. `DISCARD PLANS` changed those point lookups to indexes without changing global statistics or planner settings. This fixture-only setup repair retains all 50,000 rows, constraints, production report calls and five-second SQL/transaction limits. The cost is a PostgreSQL-specific setup command, consistent with the pinned database; product code is unchanged.
