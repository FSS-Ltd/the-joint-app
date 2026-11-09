import {
  createDecipheriv,
  createHash,
  createSign,
  createVerify,
  generateKeyPairSync,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface KeyPair {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
}

export interface DeviceIdentity {
  deviceId: string;
  name: string;
  fingerprint: string;
  publicKey: string;
  sessionToken?: string;
  sessionExpiresAt?: string;
}

export interface DecryptedEnvelope<T = unknown> {
  data: T;
  evidenceHash: string;
}

export class CompanionKeyStore {
  private keyPair: KeyPair | null = null;
  private identity: DeviceIdentity | null = null;
  private readonly configDir: string;

  constructor(customConfigDir?: string) {
    this.configDir =
      customConfigDir ||
      process.env.COMPANION_CONFIG_DIR ||
      join(homedir(), ".joint-companion");
  }

  ensureConfigDir(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true, mode: 0o700 });
    }
  }

  getOrCreateKeyPair(): KeyPair {
    if (this.keyPair) {
      return this.keyPair;
    }

    const keyPath = join(this.configDir, "companion_key.pem");
    const pubPath = join(this.configDir, "companion_pub.pem");

    if (existsSync(keyPath) && existsSync(pubPath)) {
      const privateKey = readFileSync(keyPath, "utf8");
      const publicKey = readFileSync(pubPath, "utf8");
      const fingerprint = this.computeFingerprint(publicKey);
      this.keyPair = { publicKey, privateKey, fingerprint };
      return this.keyPair;
    }

    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    const fingerprint = this.computeFingerprint(publicKey);
    this.keyPair = { publicKey, privateKey, fingerprint };

    try {
      this.ensureConfigDir();
      writeFileSync(keyPath, privateKey, { mode: 0o600 });
      writeFileSync(pubPath, publicKey, { mode: 0o644 });
    } catch {
      // In memory or restricted environments, keep in memory
    }

    return this.keyPair;
  }

  computeFingerprint(publicKey: string): string {
    return createHash("sha256").update(publicKey.trim()).digest("hex");
  }

  sign(data: string | Buffer): string {
    const kp = this.getOrCreateKeyPair();
    const signer = createSign("SHA256");
    signer.update(typeof data === "string" ? Buffer.from(data, "utf8") : data);
    signer.end();
    return signer.sign(kp.privateKey).toString("base64");
  }

  verify(publicKey: string, data: string | Buffer, signature: string): boolean {
    try {
      const verifier = createVerify("SHA256");
      verifier.update(
        typeof data === "string" ? Buffer.from(data, "utf8") : data,
      );
      verifier.end();
      return verifier.verify(publicKey, Buffer.from(signature, "base64"));
    } catch {
      return false;
    }
  }

  decryptEnvelope<T = unknown>(
    ciphertextBase64: string,
    ivBase64: string,
    tagBase64: string,
    aadContext: string,
    symmetricKey: Buffer,
  ): DecryptedEnvelope<T> {
    const iv = Buffer.from(ivBase64, "base64");
    const tag = Buffer.from(tagBase64, "base64");
    const ciphertext = Buffer.from(ciphertextBase64, "base64");

    const decipher = createDecipheriv("aes-256-gcm", symmetricKey, iv);
    decipher.setAAD(Buffer.from(aadContext, "utf8"));
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    const serialized = decrypted.toString("utf8");
    const evidenceHash = createHash("sha256").update(serialized).digest("hex");
    const data = JSON.parse(serialized) as T;

    return { data, evidenceHash };
  }

  loadIdentity(): DeviceIdentity | null {
    if (this.identity) {
      return this.identity;
    }
    const idPath = join(this.configDir, "device_identity.json");
    if (!existsSync(idPath)) {
      return null;
    }
    try {
      const raw = readFileSync(idPath, "utf8");
      this.identity = JSON.parse(raw) as DeviceIdentity;
      return this.identity;
    } catch {
      return null;
    }
  }

  saveIdentity(identity: DeviceIdentity): void {
    this.identity = identity;
    try {
      this.ensureConfigDir();
      const idPath = join(this.configDir, "device_identity.json");
      writeFileSync(idPath, JSON.stringify(identity, null, 2), {
        mode: 0o600,
      });
    } catch {
      // Keep in memory if filesystem restricted
    }
  }

  clearIdentity(): void {
    this.identity = null;
  }
}
