import type { ReactNode } from "react";
import type { EntitlementResponse } from "@joint/contracts";
import { Feedback } from "../identity/frame";

export function PrivacyContext({
  entitlements,
  error: planError,
}: {
  entitlements: EntitlementResponse | null;
  error: string;
}): ReactNode {
  return (
    <aside
      className="privacy-stack privacy-context"
      aria-label="Privacy context"
    >
      <section className="surface form-card">
        <p className="step-label">Your plan</p>
        <h2>
          {entitlements
            ? entitlements.plan === "PLUS"
              ? "Plus access"
              : "Free essentials"
            : "Privacy stays available"}
        </h2>
        <Feedback error={planError} />
        <p>
          Export, revoke sharing, leave and delete your account remain available
          on Free. Plan access never changes account ownership or sharing
          permission.
        </p>
        <p className="field-hint">
          Plus capabilities are entitlements only. Connected banking, advanced
          projections and automation are not available in this build.
        </p>
        <a href="/accounts">Manage account sharing</a>
      </section>
      <section className="surface form-card privacy-connections">
        <p className="step-label">Connections</p>
        <h2>No bank connections</h2>
        <p>
          Direct bank and broker connections are not available. Manual accounts
          and CSV imports do not create a bank authorisation.
        </p>
        <button className="button secondary" disabled>
          Disconnect bank · unavailable
        </button>
      </section>
    </aside>
  );
}
