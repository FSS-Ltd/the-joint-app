import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Server-only authenticated encryption for retained original import bytes. */
export class DataVault {
  private readonly key: Buffer;

  constructor(key: string) {
    this.key = Buffer.from(key, "base64");
    if (this.key.length !== 32 || this.key.toString("base64") !== key)
      throw new Error("Invalid import encryption configuration");
  }

  seal(value: Uint8Array, context: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(Buffer.from(context));
    const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
    return [
      "v1",
      nonce.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".");
  }

  open(value: string, context: string): Uint8Array {
    try {
      const [version, nonce, tag, ciphertext, extra] = value.split(".");
      if (
        version !== "v1" ||
        !nonce ||
        !tag ||
        ciphertext === undefined ||
        extra !== undefined
      )
        throw new Error();
      const nonceBytes = Buffer.from(nonce, "base64url");
      const tagBytes = Buffer.from(tag, "base64url");
      if (nonceBytes.length !== 12 || tagBytes.length !== 16) throw new Error();
      const decipher = createDecipheriv("aes-256-gcm", this.key, nonceBytes);
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(tagBytes);
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64url")),
        decipher.final(),
      ]);
    } catch {
      throw new Error("Stored import data unavailable");
    }
  }
}
