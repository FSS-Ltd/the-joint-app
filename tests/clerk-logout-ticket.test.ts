import { randomBytes } from "node:crypto";
import { expect, it } from "vitest";
import { IdentityVault } from "../apps/api/src/modules/identity/identity-vault.js";
import { ClerkLogoutTicket } from "../apps/api/src/modules/identity/clerk/logout-ticket.js";

it("binds cleanup authority to its original issuer, session, scope and cutoff without provider tokens", () => {
  const vault = new IdentityVault(
    randomBytes(32).toString("base64"),
    randomBytes(32).toString("base64"),
  );
  const tickets = new ClerkLogoutTicket(
    vault,
    "https://synthetic.clerk.accounts.dev",
  );
  const context = {
    issuer: "https://synthetic.clerk.accounts.dev",
    subject: "user_synthetic",
    sessionId: "sess_original",
    scope: "global" as const,
    cutoffAt: Date.now(),
  };
  const ticket = tickets.issue(context);
  expect(ticket).not.toContain("user_synthetic");
  expect(tickets.read(ticket)).toEqual(context);
  expect(() => tickets.read(ticket.slice(0, -4) + "xxxx")).toThrow();
  expect(() =>
    new ClerkLogoutTicket(vault, "https://other.clerk.accounts.dev").read(
      ticket,
    ),
  ).toThrow();
  expect(() => vault.open(ticket, "another-purpose")).toThrow();
});
it("cannot extend cleanup authority by replaying an old cutoff", () => {
  const tickets = new ClerkLogoutTicket(
    new IdentityVault(
      randomBytes(32).toString("base64"),
      randomBytes(32).toString("base64"),
    ),
    "https://synthetic.clerk.accounts.dev",
  );
  expect(() =>
    tickets.issue({
      issuer: "https://synthetic.clerk.accounts.dev",
      subject: "user_synthetic",
      sessionId: "sess_original",
      scope: "local",
      cutoffAt: Date.now() - 1_800_001,
    }),
  ).toThrow();
});
