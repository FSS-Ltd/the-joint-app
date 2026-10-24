import type { ReactNode } from "react";
import type { MeResponse } from "@joint/contracts";

export function HouseholdSummary({
  identity,
  membership,
}: {
  identity: MeResponse;
  membership: NonNullable<MeResponse["membership"]>;
}): ReactNode {
  return (
    <section className="surface form-card" aria-label="Household overview">
      <p className="step-label">Together starts here</p>
      <h2 id="household-heading">Your household is ready</h2>
      <dl className="detail-list">
        <div>
          <dt>Signed in as</dt>
          <dd className="break-word">{identity.user.email}</dd>
        </div>
        <div>
          <dt>Your role</dt>
          <dd>
            {membership.role === "ADMIN"
              ? "Household admin"
              : "Household member"}
          </dd>
        </div>
        <div>
          <dt>Members</dt>
          <dd>{membership.household.memberCount} of 2 adults</dd>
        </div>
        <div>
          <dt>Currency & time zone</dt>
          <dd>
            {membership.household.baseCurrency} ·{" "}
            {membership.household.timezone}
          </dd>
        </div>
      </dl>
    </section>
  );
}
