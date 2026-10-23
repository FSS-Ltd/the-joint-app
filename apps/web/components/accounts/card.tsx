import type { ReactNode } from "react";
import type { AccountResponse } from "@joint/contracts";
import { formatMoney, isLiabilityKind } from "@joint/domain";
import { displayDate, grantLabels, kinds, ownerLabel } from "./presentation";

export function AccountCard({
  account,
  linked = true,
}: {
  account: AccountResponse;
  linked?: boolean;
}): ReactNode {
  const value = account.latestValuation;
  return (
    <article className="surface account-card">
      <div className="account-card-top">
        <span className="account-kind-mark" aria-hidden="true">
          {isLiabilityKind(account.kind) ? "−" : "↗"}
        </span>
        <span className="account-scope">
          {account.ownership === "OWNED" ? "Yours" : "Shared with you"}
        </span>
      </div>
      <p className="account-kind">{kinds[account.kind]}</p>
      <h2>
        {linked ? (
          <a href={`/accounts/${account.id}`}>{account.label}</a>
        ) : (
          account.label
        )}
      </h2>
      <p className={`account-value${value ? "" : " unknown-value"}`}>
        {value ? formatMoney(value.money) : "No value yet"}
      </p>
      {isLiabilityKind(account.kind) && value && (
        <p className="field-hint">Outstanding debt</p>
      )}
      <p className="account-provenance">
        Manual
        {value ? (
          <>
            {" "}
            · As of{" "}
            <time dateTime={value.asOfDate}>{displayDate(value.asOfDate)}</time>
            {!value.complete && " · Partial value"}
          </>
        ) : (
          " · Add a dated value when you're ready"
        )}
      </p>
      <div className="account-card-foot">
        <span>{ownerLabel(account)}</span>
        <span className="account-sharing">
          {account.sharing
            ? grantLabels[account.sharing.level]
            : grantLabels[account.access]}
        </span>
      </div>
    </article>
  );
}
