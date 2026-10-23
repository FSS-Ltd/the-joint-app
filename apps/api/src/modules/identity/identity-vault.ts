import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
export function newOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}
export class IdentityVault {
  private readonly tokenKey: Buffer;
  private readonly emailKey: Buffer;
  constructor(tokenKey: string, emailKey: string) {
    this.tokenKey = Buffer.from(tokenKey, "base64");
    this.emailKey = Buffer.from(emailKey, "base64");
    if (this.tokenKey.length !== 32 || this.emailKey.length !== 32)
      throw new Error("Invalid identity encryption configuration");
  }
  seal(value: string, context: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.tokenKey, nonce);
    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      nonce.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
  }
  open(value: string, context: string): string {
    try {
      const [version, nonce, tag, ciphertext, extra] = value.split(".");
      if (
        version !== "v1" ||
        !nonce ||
        !tag ||
        !ciphertext ||
        extra !== undefined
      )
        throw new Error();
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.tokenKey,
        Buffer.from(nonce, "base64url"),
      );
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new Error("Stored identity data unavailable");
    }
  }
  emailHash(email: string): string {
    return createHmac("sha256", this.emailKey)
      .update(email.trim().toLowerCase())
      .digest("hex");
  }
}
