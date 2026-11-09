import type { DeletionReceipt } from "@joint/contracts";
import {
  signInStage,
  signUpStage,
  type ClerkStage,
} from "@joint/identity-runtime";
export type AuthMode = "sign-in" | "sign-up" | "recovery";
export type AccountView = "account" | "security" | "privacy" | "archive";
type EmailKind = "signup" | "device" | "recovery";
export type NativeAuthStage =
  ClerkStage | { step: "email-request"; kind: EmailKind };
type Attempt = {
  id?: string;
  status: string | null;
  unverifiedFields?: readonly string[];
  missingFields?: readonly string[];
  supportedSecondFactors?: ReadonlyArray<{ strategy: string }>;
  firstFactorVerification?: {
    strategy?: string | null;
    status?: string | null;
  };
};
type EmailProgress = {
  id: string;
  kind: EmailKind;
  sent: boolean;
  resendAt: number;
};

/** Nonsecret workflow progress survives concealment, never an actor change or explicit abandonment. */
export class NativeWorkflow {
  private actor: string | null = null;
  private actorEpoch = 0;
  private authEpoch = 0;
  private lifecycleEpoch = 0;
  private mode: AuthMode | undefined;
  private revision = 0;
  private emails = new Map<AuthMode, EmailProgress>();
  private listeners = new Set<() => void>();
  view: AccountView = "account";
  private returnView: "account" | "privacy" | "archive" = "account";
  securityOpen = false;
  enrollmentPending = false;
  deletionReceipt: DeletionReceipt | null = null;
  constructor(private readonly isActive: () => boolean = () => true) {}
  getSnapshot = (): number => this.revision;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private changed(): void {
    this.revision++;
    this.listeners.forEach((listener) => listener());
  }
  identify(actor: string | null): void {
    if (this.actor === actor) return;
    this.actor = actor;
    this.actorEpoch++;
    this.emails.clear();
    this.enrollmentPending = false;
    this.securityOpen = false;
    this.view = "account";
    this.returnView = "account";
    if (actor !== null) this.deletionReceipt = null;
    this.changed();
  }
  conceal(): void {
    this.lifecycleEpoch++;
    if (this.deletionReceipt !== null) {
      this.deletionReceipt = null;
      this.changed();
    }
  }
  openAuth(mode: AuthMode): void {
    if (this.mode !== mode) {
      this.mode = mode;
      this.authEpoch++;
    }
  }
  abandonAuth(): void {
    this.authEpoch++;
    this.emails.clear();
    this.changed();
  }
  capture(): { current(): boolean; active(): boolean } {
    const actor = this.actorEpoch,
      auth = this.authEpoch,
      lifecycle = this.lifecycleEpoch;
    const current = () => actor === this.actorEpoch && auth === this.authEpoch;
    return {
      current,
      active: () =>
        current() && lifecycle === this.lifecycleEpoch && this.isActive(),
    };
  }
  showView(next: AccountView): void {
    this.view = next;
    this.securityOpen = next === "security";
    if (next !== "security") this.returnView = next;
    this.changed();
  }
  showSecurity(value: boolean, from?: "account" | "privacy" | "archive"): void {
    if (value) {
      if (from) this.returnView = from;
      else if (this.view !== "security") this.returnView = this.view;
      this.view = "security";
      this.securityOpen = true;
    } else {
      this.view = this.returnView;
      this.securityOpen = false;
    }
    this.changed();
  }
  setDeletionReceipt(receipt: DeletionReceipt | null): void {
    this.deletionReceipt = receipt;
    this.changed();
  }
  setEnrollmentPending(value: boolean): void {
    this.enrollmentPending = value;
    this.changed();
  }
  rememberEmail(
    mode: AuthMode,
    id: string | undefined,
    kind: EmailKind,
    sent: boolean,
  ): void {
    if (!id) return;
    this.emails.set(mode, {
      id,
      kind,
      sent,
      resendAt: sent ? Date.now() + 30000 : 0,
    });
    this.changed();
  }
  resendAt(mode: AuthMode, id: string | undefined): number {
    const saved = this.emails.get(mode);
    return saved && saved.id === id ? saved.resendAt : 0;
  }
  stage(mode: AuthMode, attempt: Attempt): NativeAuthStage {
    if (!attempt.id) return { step: "credentials" };
    if (attempt.status === "complete") return { step: "complete" };
    if (attempt.status === "needs_new_password") return { step: "password" };
    const saved = this.emails.get(mode);
    const email = (kind: EmailKind): NativeAuthStage => ({
      step:
        saved && saved.id === attempt.id && saved.kind === kind && saved.sent
          ? "email"
          : "email-request",
      kind,
    });
    if (mode === "sign-up" && attempt.status === "missing_requirements") {
      const next = signUpStage({
        status: attempt.status,
        unverifiedFields: attempt.unverifiedFields ?? [],
        missingFields: attempt.missingFields ?? [],
      });
      return next?.step === "email"
        ? email(next.kind)
        : (next ?? { step: "credentials" });
    }
    if (
      mode === "recovery" &&
      attempt.status === "needs_first_factor" &&
      (saved?.id === attempt.id ||
        attempt.firstFactorVerification?.strategy ===
          "reset_password_email_code")
    )
      return email("recovery");
    if (
      ["needs_client_trust", "needs_second_factor"].includes(
        attempt.status ?? "",
      )
    ) {
      const next = signInStage({
        status: attempt.status ?? "",
        supportedSecondFactors: attempt.supportedSecondFactors ?? [],
      });
      return next?.step === "email"
        ? email(next.kind)
        : (next ?? { step: "credentials" });
    }
    return { step: "credentials" };
  }
}
