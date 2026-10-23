import { ClerkLegacyLinker } from "./clerk/legacy-linker.js";
import type {
  AuthServerEnvironment,
  ClerkServerEnvironment,
} from "@joint/contracts";
import type { PrismaClient } from "@joint/database/client";
import { AuthProvider } from "./auth-provider.js";
import { IdentityService, type IdentityAccess } from "./identity.service.js";
import { IdentityVerifier } from "./identity-verifier.js";
import { IdentityVault } from "./identity-vault.js";
import { SessionStore } from "./session-store.js";
import { ClerkCredentialVerifier } from "./clerk/credential-verifier.js";
import type { ClerkGateway } from "./clerk/provider-gateway.js";
import { ClerkIdentityStore } from "./clerk/identity-store.js";
import { ClerkIdentityService } from "./clerk/identity.service.js";
import { ClerkLogoutTicket } from "./clerk/logout-ticket.js";
import { ClerkLogout } from "./clerk/logout.service.js";
import {
  createClerkTotpVerifier,
  type ClerkTotpVerifier,
} from "./clerk/totp-verifier.js";
import {
  createClerkRevoker,
  type ClerkRevoker,
} from "./clerk/session-revoker.js";

export type IdentityAdapterOptions = { database: PrismaClient } & (
  | { provider?: "local"; environment: AuthServerEnvironment }
  | {
      provider: "clerk";
      environment: ClerkServerEnvironment &
        Pick<AuthServerEnvironment, "AUTH_TOKEN_KEY" | "AUTH_EMAIL_HASH_KEY">;
      clerkGateway?: ClerkGateway;
      clerkRevoker?: ClerkRevoker;
      clerkTotp?: ClerkTotpVerifier;
      legacyEnvironment?: AuthServerEnvironment;
    }
);
export function createIdentityAdapter(options: IdentityAdapterOptions): {
  identity: IdentityAccess;
  vault: IdentityVault;
  legacyLinker?: ClerkLegacyLinker;
  clerkLogout?: ClerkLogout;
} {
  const vault = new IdentityVault(
    options.environment.AUTH_TOKEN_KEY,
    options.environment.AUTH_EMAIL_HASH_KEY,
  );
  if (options.provider === "clerk") {
    const verifier = new ClerkCredentialVerifier(
      options.environment,
      options.clerkGateway,
    );
    const store = new ClerkIdentityStore(options.database, vault);
    const logout = new ClerkLogout(
      options.database,
      verifier,
      options.clerkRevoker ?? createClerkRevoker(options.environment),
      options.environment.CLERK_TIMEOUT_MS,
      new ClerkLogoutTicket(vault, options.environment.CLERK_ISSUER),
    );
    const totp =
      options.clerkTotp ?? createClerkTotpVerifier(options.environment);
    const legacy = options.legacyEnvironment;
    if (
      legacy &&
      (legacy.AUTH_TOKEN_KEY !== options.environment.AUTH_TOKEN_KEY ||
        legacy.AUTH_EMAIL_HASH_KEY !== options.environment.AUTH_EMAIL_HASH_KEY)
    )
      throw new Error("Legacy identity keys must remain unchanged");
    const legacyLinker = legacy
      ? new ClerkLegacyLinker(
          verifier,
          totp,
          new SessionStore(
            options.database,
            vault,
            new IdentityVerifier(legacy.AUTH_ISSUER),
            new AuthProvider(
              legacy.SUPABASE_AUTH_URL,
              legacy.SUPABASE_PUBLISHABLE_KEY,
            ),
          ),
          store,
        )
      : undefined;
    return {
      legacyLinker,
      clerkLogout: logout,
      identity: new ClerkIdentityService(verifier, store, logout, totp),
      vault,
    };
  }
  const env = options.environment;
  const provider = new AuthProvider(
    env.SUPABASE_AUTH_URL,
    env.SUPABASE_PUBLISHABLE_KEY,
  );
  const sessions = new SessionStore(
    options.database,
    vault,
    new IdentityVerifier(env.AUTH_ISSUER),
    provider,
  );
  return {
    identity: new IdentityService(sessions, provider, options.database, vault),
    vault,
  };
}
