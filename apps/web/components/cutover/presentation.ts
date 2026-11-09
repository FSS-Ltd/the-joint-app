export interface CutoverLinks {
  security: string;
  privacy: string;
  archive: string;
  deletion: string;
  signIn: string;
  signOut: string;
  appStore: string;
}

export const CUTOVER_LINKS: CutoverLinks = {
  security: "/security",
  privacy: "/settings/privacy",
  archive: "/archive",
  deletion: "/privacy/deletion",
  signIn: "/sign-in",
  signOut: "/sign-out",
  appStore: "https://apps.apple.com/app/the-family-fund",
};

export const RETIRED_HOUSEHOLD_ROUTES = [
  "/dashboard",
  "/accounts",
  "/accounts/[id]",
  "/activity",
  "/activity/[transactionId]",
  "/budgets",
  "/review",
  "/imports",
  "/imports/[batchId]",
  "/household",
] as const;

export const PRESERVED_WEB_ROUTES = [
  "/",
  "/cutover",
  "/sign-in",
  "/sign-up",
  "/sign-out",
  "/recovery",
  "/auth/callback",
  "/auth/complete",
  "/auth/task/password",
  "/security",
  "/settings/privacy",
  "/privacy/deletion",
  "/archive",
  "/join",
  "/staff",
] as const;
