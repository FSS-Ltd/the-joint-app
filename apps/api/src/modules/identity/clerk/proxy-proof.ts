type Fields = Record<string, unknown>;
function fields(value: unknown): Fields | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

/** Untrusted provider fields must still be checked by the normal credential verifier. */
export function providerTotpCandidate(
  action: "sign-in" | "enrollment",
  body: unknown,
): { subject: string; sessionId: string; token: string } | null {
  const root = fields(body);
  const response = fields(root?.response);
  const client = fields(root?.client);
  const verification = fields(response?.second_factor_verification);
  if (
    !response ||
    !client ||
    !Array.isArray(client.sessions) ||
    client.sessions.length > 100
  )
    return null;
  if (action === "enrollment" && response.verified !== true) return null;
  if (
    action === "sign-in" &&
    (response.status !== "complete" ||
      verification?.strategy !== "totp" ||
      verification.status !== "verified")
  )
    return null;
  const sessionId =
    action === "enrollment"
      ? client.last_active_session_id
      : response.created_session_id;
  if (
    typeof sessionId !== "string" ||
    !/^sess_[A-Za-z0-9]+$/.test(sessionId) ||
    (action === "sign-in" && sessionId !== client.last_active_session_id)
  )
    return null;
  const matches = client.sessions
    .map(fields)
    .filter((session) => session?.id === sessionId);
  if (matches.length !== 1) return null;
  const selected = matches[0];
  const user = fields(selected?.user);
  const token = fields(selected?.last_active_token)?.jwt;
  if (
    typeof user?.id !== "string" ||
    !/^user_[A-Za-z0-9]+$/.test(user.id) ||
    typeof token !== "string" ||
    token.length < 1 ||
    token.length > 16384
  )
    return null;
  return { subject: user.id, sessionId, token };
}
