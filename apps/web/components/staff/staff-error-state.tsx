import Link from "next/link";

interface StaffRefusalViewProps {
  readonly status: number;
  readonly message: string;
}

export function StaffRefusalView({ status, message }: StaffRefusalViewProps) {
  if (status === 401) {
    return (
      <div className="staff-refusal-card" role="alert">
        <h2 className="staff-refusal-title">Sign In Required</h2>
        <p className="staff-refusal-body">
          You must be signed in with an active account to access the staff
          portal.
        </p>
        <Link href="/sign-in" className="staff-filter-btn active">
          Go to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="staff-refusal-card" role="alert">
      <h2 className="staff-refusal-title">Staff Access Required</h2>
      <p className="staff-refusal-body">
        {message ||
          "Your account does not possess explicit staff authorization. Household and purchaser roles do not grant access to commercial analytics."}
      </p>
      <Link href="/dashboard" className="staff-filter-btn active">
        Return to Household Dashboard
      </Link>
    </div>
  );
}

interface StaffErrorBannerProps {
  readonly message: string;
  readonly onRetry: () => void;
}

export function StaffErrorBanner({ message, onRetry }: StaffErrorBannerProps) {
  return (
    <div className="staff-error-banner" role="alert">
      <span>{message}</span>
      <button type="button" className="staff-refresh-btn" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
