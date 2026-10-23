import type { Type } from "@nestjs/common";
import type { AuthServerEnvironment } from "@joint/contracts";
import type { PrismaClient } from "@joint/database/client";
import { AuthProvider } from "./auth-provider.js";
import { IdentityService } from "./identity.service.js";
import { IdentityVerifier } from "./identity-verifier.js";
import { IdentityVault } from "./identity-vault.js";
import { SessionStore } from "./session-store.js";
import { createIdentityController } from "./identity.controller.js";
import { HouseholdService } from "../households/households.service.js";
import { ScopedDatabase } from "@joint/database/scoped";
import { createAccountsController } from "../accounts/accounts.controller.js";
import { AccountQueries } from "../accounts/account-queries.js";
import { AccountMutations } from "../accounts/account-mutations.js";
import { AccountGrants } from "../accounts/account-grants.js";
export interface AuthOptions {
  database: PrismaClient;
  environment: AuthServerEnvironment;
}
export function identityControllers(options?: AuthOptions): Type<unknown>[] {
  if (!options) return [createIdentityController(), createAccountsController()];
  const { database, environment: env } = options;
  const provider = new AuthProvider(
    env.SUPABASE_AUTH_URL,
    env.SUPABASE_PUBLISHABLE_KEY,
  );
  const vault = new IdentityVault(env.AUTH_TOKEN_KEY, env.AUTH_EMAIL_HASH_KEY);
  const sessions = new SessionStore(
    database,
    vault,
    new IdentityVerifier(env.AUTH_ISSUER),
    provider,
  );
  const identity = new IdentityService(sessions, provider, database, vault);
  const scoped = new ScopedDatabase(database);
  return [
    createIdentityController(identity, new HouseholdService(database, vault)),
    createAccountsController({
      identity,
      queries: new AccountQueries(scoped, vault),
      mutations: new AccountMutations(scoped, vault),
      grants: new AccountGrants(scoped),
    }),
  ];
}
