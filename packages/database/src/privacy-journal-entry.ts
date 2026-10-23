interface JournalBase {
  version: 1;
  eventId: string;
  requestId: string;
  userId: string;
  recordedAt: string;
}
export interface ClerkPrivacyIdentity {
  provider: "clerk";
  issuer: string;
  subject: string;
}
export type PrivacyJournalEntry = JournalBase &
  (
    | {
        kind: "DELETE_USER";
        householdId?: never;
        providerIdentities?: readonly ClerkPrivacyIdentity[];
      }
    | { kind: "LEAVE_HOUSEHOLD"; householdId: string }
  );

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A journal accepts identifiers and verified intent only, never request payloads. */
export function parseJournalEntry(value: unknown): PrivacyJournalEntry {
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("eventId" in value) ||
    typeof value.eventId !== "string" ||
    !uuid.test(value.eventId) ||
    !("requestId" in value) ||
    typeof value.requestId !== "string" ||
    !uuid.test(value.requestId) ||
    !("userId" in value) ||
    typeof value.userId !== "string" ||
    !uuid.test(value.userId) ||
    !("recordedAt" in value) ||
    typeof value.recordedAt !== "string" ||
    !Number.isFinite(Date.parse(value.recordedAt)) ||
    new Date(value.recordedAt).toISOString() !== value.recordedAt ||
    !("kind" in value)
  )
    throw new Error("Invalid privacy journal entry");
  const base: JournalBase = {
    version: 1,
    eventId: value.eventId,
    requestId: value.requestId,
    userId: value.userId,
    recordedAt: value.recordedAt,
  };
  if (value.kind === "DELETE_USER") {
    if (Object.keys(value).length === 6)
      return { ...base, kind: "DELETE_USER" };
    if (Object.keys(value).length === 7 && "providerIdentities" in value) {
      return {
        ...base,
        kind: "DELETE_USER",
        providerIdentities: parseProviderIdentities(value.providerIdentities),
      };
    }
  }
  if (
    value.kind === "LEAVE_HOUSEHOLD" &&
    "householdId" in value &&
    typeof value.householdId === "string" &&
    uuid.test(value.householdId) &&
    Object.keys(value).length === 7
  )
    return { ...base, kind: "LEAVE_HOUSEHOLD", householdId: value.householdId };
  throw new Error("Invalid privacy journal entry");
}

export function parseProviderIdentities(
  value: unknown,
): ClerkPrivacyIdentity[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 5)
    throw new Error("Invalid privacy journal entry");
  const seen = new Set<string>();
  return value.map((identity: unknown) => {
    if (
      !identity ||
      typeof identity !== "object" ||
      Object.keys(identity).length !== 3 ||
      !("provider" in identity) ||
      identity.provider !== "clerk" ||
      !("issuer" in identity) ||
      typeof identity.issuer !== "string" ||
      identity.issuer.length > 255 ||
      !("subject" in identity) ||
      typeof identity.subject !== "string" ||
      !/^user_[A-Za-z0-9]{1,123}$/.test(identity.subject)
    )
      throw new Error("Invalid privacy journal entry");
    const url = new URL(identity.issuer);
    if (
      url.origin !== identity.issuer ||
      url.protocol !== "https:" ||
      url.username ||
      url.password
    )
      throw new Error("Invalid privacy journal entry");
    const key = `${identity.issuer}:${identity.subject}`;
    if (seen.has(key)) throw new Error("Invalid privacy journal entry");
    seen.add(key);
    return {
      provider: "clerk",
      issuer: identity.issuer,
      subject: identity.subject,
    };
  });
}
