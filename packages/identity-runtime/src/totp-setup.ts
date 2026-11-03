const allowedParameters = new Set([
  "secret",
  "issuer",
  "algorithm",
  "digits",
  "period",
]);

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/** Accept only a creation-time TOTP URI paired with its provider-issued key. */
export function getTotpSetupUri(uri: unknown, secret: unknown): string | null {
  if (
    typeof uri !== "string" ||
    uri.length > 2048 ||
    uri !== uri.trim() ||
    hasControlCharacters(uri) ||
    !/^otpauth:\/\/totp\//i.test(uri) ||
    uri.includes("#") ||
    typeof secret !== "string" ||
    !secret.trim() ||
    secret.length > 2048 ||
    hasControlCharacters(secret)
  )
    return null;
  try {
    const address = new URL(uri);
    const label = decodeURIComponent(address.pathname.slice(1));
    if (
      address.protocol !== "otpauth:" ||
      address.hostname !== "totp" ||
      address.username ||
      address.password ||
      address.port ||
      address.hash ||
      !label.trim() ||
      hasControlCharacters(label)
    )
      return null;
    const seen = new Set<string>();
    for (const [key, value] of address.searchParams) {
      if (
        !allowedParameters.has(key) ||
        seen.has(key) ||
        hasControlCharacters(value)
      )
        return null;
      seen.add(key);
      if (key === "algorithm" && !["SHA1", "SHA256", "SHA512"].includes(value))
        return null;
      if (key === "digits" && value !== "6") return null;
      if (key === "period" && value !== "30") return null;
    }
    return address.searchParams.get("secret") === secret ? uri : null;
  } catch {
    return null;
  }
}
