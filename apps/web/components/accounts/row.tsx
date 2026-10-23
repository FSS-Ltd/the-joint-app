import type { ReactNode } from "react";
import type { AccountResponse } from "@joint/contracts";
import { formatMoney, isLiabilityKind } from "@joint/domain";
import { displayDate, grantLabels, kinds, ownerLabel } from "./presentation";

export function AccountRow({
  account,
}: {
  account: AccountResponse;
}): ReactNode {
  const value = account.latestValuation;
  return (
    <article className="surface account-card account-row">
      <div className="account-row-identity">
        <span className="account-kind-mark" aria-hidden="true">
          {isLiabilityKind(account.kind) ? "−" : "↗"}
        </span>
        <div>
          <p className="account-kind">{kinds[account.kind]}</p>
          <h4>
            <a href={`/accounts/${account.id}`}>{account.label}</a>
          </h4>
        </div>
      </div>
      <div className="account-row-value">
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
              ·{" "}
              <time dateTime={value.asOfDate}>
                {displayDate(value.asOfDate)}
              </time>
              {!value.complete && " · Partial value"}
            </>
          ) : (
            " · No dated value"
          )}
        </p>
      </div>
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
