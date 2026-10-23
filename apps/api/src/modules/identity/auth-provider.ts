import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { decodeJwt } from "jose";
import {
  AuthClient,
  type AuthSession,
  type AuthUser,
} from "@supabase/supabase-js";

export type ProviderCredentials = Pick<
  AuthSession,
  "access_token" | "refresh_token"
>;
export interface ProviderFactor {
  id: string;
  friendlyName: string | undefined;
  status: "verified" | "unverified";
}
export interface ProviderEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

/** Ephemeral server-only clients; the caller owns persistence and refresh locking. */
export class AuthProvider {
  constructor(
    private readonly authUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 3000,
  ) {}

  private client(): InstanceType<typeof AuthClient> {
    const deadline = Date.now() + this.timeoutMs;
    const unavailable = (): Response =>
      Response.json(
        {
          message: "Authentication unavailable",
          error_code: "joint_provider_unavailable",
        },
        { status: 400 },
      );
    return new AuthClient({
      url: this.authUrl,
      headers: { apikey: this.apiKey },
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      fetch: async (input, init) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) return unavailable();
        try {
          const response = await fetch(input, {
            ...init,
            signal: init?.signal
              ? AbortSignal.any([init.signal, AbortSignal.timeout(remaining)])
              : AbortSignal.timeout(remaining),
          });
          if (response.status >= 500) {
            await response.body?.cancel();
            return unavailable();
          }
          return response;
        } catch {
          // A non-retryable internal code bounds SDK backoff; check() restores safe HTTP 503.
          // Avoid SDK network diagnostics containing request URLs or credentials.
          return unavailable();
        }
      },
    });
  }

  private check(error: { status?: number; code?: string } | null): void {
    if (!error) return;
    if (
      error.code === "joint_provider_unavailable" ||
      !error.status ||
      error.status >= 500
    )
      throw new ServiceUnavailableException("Authentication unavailable");
    if (error.status === 429)
      throw new ServiceUnavailableException(
        "Authentication temporarily unavailable",
      );
    throw new UnauthorizedException("Authentication failed");
  }

  private async authenticated(
    credentials: ProviderCredentials,
  ): Promise<InstanceType<typeof AuthClient>> {
    // Parsing only: the parent verifies signatures. Prevent SDK-owned implicit refresh.
    try {
      const { exp } = decodeJwt(credentials.access_token);
      if (!exp || exp <= Date.now() / 1000 + 5)
        throw new Error("Expired provider credentials");
    } catch {
      throw new UnauthorizedException("Authentication failed");
    }
    const client = this.client();
    const { error } = await client.setSession(credentials);
    this.check(error);
    return client;
  }

  async signup(email: string, password: string): Promise<void> {
    const { error } = await this.client().signUp({ email, password });
    if (
      error &&
      error.code !== "joint_provider_unavailable" &&
      error.status &&
      error.status < 500 &&
      error.status !== 429
    )
      throw new BadRequestException("Unable to complete registration");
    this.check(error);
  }

  async login(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await this.client().signInWithPassword({
      email,
      password,
    });
    this.check(error);
    if (!data.session) throw new UnauthorizedException("Authentication failed");
    return data.session;
  }

  async verify(
    email: string,
    code: string,
    type: "signup" | "recovery",
  ): Promise<AuthSession> {
    const { data, error } = await this.client().verifyOtp({
      email,
      token: code,
      type,
    });
    this.check(error);
    if (!data.session) throw new UnauthorizedException("Authentication failed");
    return data.session;
  }

  async recovery(email: string): Promise<void> {
    const { error } = await this.client().resetPasswordForEmail(email);
    this.check(error);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const { data, error } = await this.client().refreshSession({
      refresh_token: refreshToken,
    });
    this.check(error);
    if (!data.session) throw new UnauthorizedException("Authentication failed");
    return data.session;
  }

  async getUser(accessToken: string): Promise<AuthUser> {
    const { data, error } = await this.client().getUser(accessToken);
    this.check(error);
    if (!data.user) throw new UnauthorizedException("Authentication failed");
    return data.user;
  }

  async factors(credentials: ProviderCredentials): Promise<ProviderFactor[]> {
    const client = await this.authenticated(credentials);
    const { data, error } = await client.mfa.listFactors();
    this.check(error);
    if (!data) throw new UnauthorizedException("Authentication failed");
    return data.all.map(({ id, friendly_name, status }) => ({
      id,
      friendlyName: friendly_name,
      status,
    }));
  }

  async enroll(credentials: ProviderCredentials): Promise<ProviderEnrollment> {
    const client = await this.authenticated(credentials);
    const listed = await client.mfa.listFactors();
    this.check(listed.error);
    if (!listed.data) throw new UnauthorizedException("Authentication failed");
    if (
      listed.data.all.some(
        (factor) =>
          factor.factor_type === "totp" && factor.status === "verified",
      )
    )
      throw new ConflictException("Authenticator already configured");
    for (const factor of listed.data.all) {
      if (factor.factor_type !== "totp" || factor.status !== "unverified")
        continue;
      const { error } = await client.mfa.unenroll({ factorId: factor.id });
      this.check(error);
    }
    const { data, error } = await client.mfa.enroll({ factorType: "totp" });
    this.check(error);
    if (!data) throw new UnauthorizedException("Authentication failed");
    return {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    };
  }

  async verifyMfa(
    credentials: ProviderCredentials,
    factorId: string,
    code: string,
  ): Promise<AuthSession> {
    const client = await this.authenticated(credentials);
    const { data, error } = await client.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (
      error?.code !== "joint_provider_unavailable" &&
      error?.status &&
      error.status < 500 &&
      error.status !== 429
    )
      throw new BadRequestException("Unable to verify authentication code");
    this.check(error);
    if (!data) throw new UnauthorizedException("Authentication failed");
    return {
      ...data,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    };
  }

  async updatePassword(
    credentials: ProviderCredentials,
    password: string,
  ): Promise<void> {
    const client = await this.authenticated(credentials);
    const { error } = await client.updateUser({ password });
    this.check(error);
  }

  async signOut(
    accessToken: string,
    scope: "local" | "global" | "others",
  ): Promise<void> {
    const { error } = await this.client().admin.signOut(accessToken, scope);
    this.check(error);
  }
}
