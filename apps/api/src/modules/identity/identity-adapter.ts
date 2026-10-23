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
import { ClerkLogout } from "./clerk/logout.service.js";
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
    }
);
export function createIdentityAdapter(options: IdentityAdapterOptions): {
  identity: IdentityAccess;
  vault: IdentityVault;
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
    );
    return {
      identity: new ClerkIdentityService(verifier, store, logout),
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
