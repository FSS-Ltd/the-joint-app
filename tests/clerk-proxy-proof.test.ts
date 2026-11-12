import { describe, expect, it } from "vitest";
import { providerTotpCandidate } from "../apps/api/src/modules/identity/clerk/proxy-proof.js";

const session = (id: string, userId: string) => ({
  id,
  user: { id: userId },
  last_active_token: { jwt: `jwt-${id}` },
});

describe("Clerk proxy TOTP response selection", () => {
  it("uses the created session rather than array order on TOTP sign-in", () => {
    expect(
      providerTotpCandidate("sign-in", {
        response: {
          status: "complete",
          created_session_id: "sess_actual",
          second_factor_verification: { strategy: "totp", status: "verified" },
        },
        client: {
          last_active_session_id: "sess_actual",
          sessions: [
            session("sess_other", "user_other"),
            session("sess_actual", "user_actual"),
          ],
        },
      }),
    ).toEqual({
      sessionId: "sess_actual",
      subject: "user_actual",
      token: "jwt-sess_actual",
    });
  });

  it("rejects backup and email verification even when a session token exists", () => {
    for (const strategy of ["backup_code", "email_code"]) {
      expect(
        providerTotpCandidate("sign-in", {
          response: {
            status: "complete",
            created_session_id: "sess_actual",
            second_factor_verification: { strategy, status: "verified" },
          },
          client: {
            last_active_session_id: "sess_actual",
            sessions: [session("sess_actual", "user_actual")],
          },
        }),
      ).toBeNull();
    }
  });

  it("uses the provider active session for verified enrollment and rejects missing or ambiguous bindings", () => {
    const body = {
      response: { verified: true },
      client: {
        last_active_session_id: "sess_actual",
        sessions: [
          session("sess_other", "user_other"),
          session("sess_actual", "user_actual"),
        ],
      },
    };
    expect(providerTotpCandidate("enrollment", body)).toEqual({
      sessionId: "sess_actual",
      subject: "user_actual",
      token: "jwt-sess_actual",
    });
    expect(
      providerTotpCandidate("enrollment", {
        ...body,
        response: { verified: false },
      }),
    ).toBeNull();
    expect(
      providerTotpCandidate("enrollment", {
        ...body,
        client: {
          ...body.client,
          sessions: [
            ...body.client.sessions,
            session("sess_actual", "user_other"),
          ],
        },
      }),
    ).toBeNull();
  });
});
