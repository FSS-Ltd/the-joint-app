import type {
  CompanionClaimRequest,
  CompanionClaimResponse,
  CompanionCompleteRequest,
  CompanionCompleteResponse,
  CompanionEvidenceResponse,
  CompanionPermitRequest,
  CompanionPermitResponse,
  CompanionRenewRequest,
  CompanionRenewResponse,
  CompletePairingRequest,
  CompletePairingResponse,
  DeviceSessionRequest,
  DeviceSessionResponse,
  SessionChallengeRequest,
  SessionChallengeResponse,
} from "@joint/contracts";

export interface CompanionClientOptions {
  baseUrl: string;
  sessionToken?: string;
}

export class CompanionClient {
  private baseUrl: string;
  private sessionToken?: string;

  constructor(options: CompanionClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.sessionToken = options.sessionToken;
  }

  setSessionToken(token: string): void {
    this.sessionToken = token;
  }

  getSessionToken(): string | undefined {
    return this.sessionToken;
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
    requiresAuth = true,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (requiresAuth) {
      if (!this.sessionToken) {
        throw new Error(
          "Client session token is required for authenticated calls.",
        );
      }
      headers["Authorization"] = `Bearer ${this.sessionToken}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errorText = await res.text();
      let parsedMessage = errorText;
      try {
        const parsed = JSON.parse(errorText) as { message?: string };
        if (parsed.message) {
          parsedMessage = parsed.message;
        }
      } catch {
        // use raw errorText
      }
      throw new Error(`Companion API Error (${res.status}): ${parsedMessage}`);
    }

    return (await res.json()) as T;
  }

  async completePairing(
    request: CompletePairingRequest,
  ): Promise<CompletePairingResponse> {
    return this.request<CompletePairingResponse>(
      "/v1/companion/pairing/complete",
      "POST",
      request,
      false,
    );
  }

  async createSessionChallenge(
    request: SessionChallengeRequest,
  ): Promise<SessionChallengeResponse> {
    return this.request<SessionChallengeResponse>(
      "/v1/companion/session/challenge",
      "POST",
      request,
      false,
    );
  }

  async authenticateSession(
    request: DeviceSessionRequest,
  ): Promise<DeviceSessionResponse> {
    const res = await this.request<DeviceSessionResponse>(
      "/v1/companion/session/auth",
      "POST",
      request,
      false,
    );
    this.sessionToken = res.sessionToken;
    return res;
  }

  async claimJob(
    request: CompanionClaimRequest,
  ): Promise<CompanionClaimResponse> {
    return this.request<CompanionClaimResponse>(
      "/v1/companion/jobs/claim",
      "POST",
      request,
      true,
    );
  }

  async getEvidenceEnvelope(jobId: string): Promise<CompanionEvidenceResponse> {
    return this.request<CompanionEvidenceResponse>(
      `/v1/companion/jobs/${jobId}/evidence`,
      "GET",
      undefined,
      true,
    );
  }

  async checkPermit(
    jobId: string,
    request: CompanionPermitRequest,
  ): Promise<CompanionPermitResponse> {
    return this.request<CompanionPermitResponse>(
      `/v1/companion/jobs/${jobId}/permit`,
      "POST",
      request,
      true,
    );
  }

  async renewLease(
    jobId: string,
    request: CompanionRenewRequest,
  ): Promise<CompanionRenewResponse> {
    return this.request<CompanionRenewResponse>(
      `/v1/companion/jobs/${jobId}/renew`,
      "POST",
      request,
      true,
    );
  }

  async completeJob(
    jobId: string,
    request: CompanionCompleteRequest,
  ): Promise<CompanionCompleteResponse> {
    return this.request<CompanionCompleteResponse>(
      `/v1/companion/jobs/${jobId}/complete`,
      "POST",
      request,
      true,
    );
  }
}
