import type { Page } from "@playwright/test";
import type { MeResponse } from "../../packages/contracts/dist/index.js";
import { accountWorkspaceFixture, identity } from "./account-workspace.js";

if (!identity.membership) throw Error("Missing synthetic household");
export const soloIdentity: MeResponse = {
  ...identity,
  membership: {
    ...identity.membership,
    household: { ...identity.membership.household, memberCount: 1 },
  },
};
export async function identityWorkspaceFixture(page: Page): Promise<{
  setIdentity: (value: MeResponse) => void;
  invitationPosts: () => number;
}> {
  await accountWorkspaceFixture(page);
  let current = soloIdentity;
  let invitations = 0;
  await page.route("**/api/me", (route) => route.fulfill({ json: current }));
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { csrfToken: "synthetic-csrf" } }),
  );
  await page.route("**/api/auth/signup", (route) =>
    route.fulfill({ json: { state: "VERIFY_EMAIL" } }),
  );
  await page.route("**/api/auth/mfa/enroll", (route) =>
    route.fulfill({
      json: {
        factorId: "synthetic-factor",
        secret: "SYNTHETICSETUPKEYONLY",
        qrCode:
          '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/></svg>',
      },
    }),
  );
  await page.route("**/api/privacy/deletion-requests/*", (route) =>
    route.fulfill({
      json: {
        id: "77777777-7777-4777-8777-777777777777",
        state: "COMPLETED",
        requestedAt: "2026-10-24T00:00:00.000Z",
        completedAt: "2026-10-24T00:01:00.000Z",
      },
    }),
  );
  await page.route("**/api/households/*/invitations", (route) => {
    invitations++;
    return route.fulfill({
      json: { token: "synthetic-private-invitation-".repeat(6) },
    });
  });
  return {
    setIdentity: (value) => {
      current = value;
    },
    invitationPosts: () => invitations,
  };
}
