import type { ReactNode } from "react";

export function CollectionOverview({
  count,
  more,
}: {
  count: number;
  more: boolean;
}): ReactNode {
  return (
    <section className="account-overview" aria-label="Your account overview">
      <div className="surface account-overview-panel">
        <div>
          <p className="step-label">Only accounts you can view</p>
          <h2>
            {count} {count === 1 ? "account" : "accounts"} loaded
          </h2>
          <p>
            Your own records and the accounts shared with you. Viewing access
            does not change ownership.
          </p>
          {more && <p className="field-hint">More accounts are available.</p>}
        </div>
        <div className="account-overview-actions">
          <a className="button primary" href="#add-account">
            Add account<span aria-hidden="true">＋</span>
          </a>
          <a className="button secondary" href="/imports">
            Import CSV<span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
      <p className="account-source-note">
        Manual dated values · CSV records are imported separately. Direct bank
        connections are planned after MVP.
      </p>
    </section>
  );
}
