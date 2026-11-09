import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createSign,
  createVerify,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";

export function generatePairingCode(): string {
  // 6-digit numeric pairing code (e.g. 482910)
  const num = randomBytes(4).readUInt32BE(0) % 1000000;
  return num.toString().padStart(6, "0");
}

export function computeFingerprint(publicKey: string): string {
  return createHash("sha256").update(publicKey.trim()).digest("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getCompanionEnvelopeKey(seed?: string): Buffer {
  const secret =
    seed ||
    process.env.COMPANION_ENVELOPE_KEY ||
    process.env.AUTH_TOKEN_SECRET ||
    process.env.DATABASE_URL ||
    "joint_companion_envelope_secure_seed_fallback";
  return createHash("sha256").update(secret).digest();
}

export function verifyDeviceSignature(
  publicKey: string,
  data: string | Buffer,
  signature: string,
): boolean {
  try {
    const verifier = createVerify("SHA256");
    verifier.update(
      typeof data === "string" ? Buffer.from(data, "utf8") : data,
    );
    verifier.end();
    return verifier.verify(publicKey, Buffer.from(signature, "base64"));
  } catch {
    // If not a standard PEM or verify fails, handle simulated/custom test signatures
    return false;
  }
}

export function signWithPrivateKey(
  privateKey: string,
  data: string | Buffer,
): string {
  const signer = createSign("SHA256");
  signer.update(typeof data === "string" ? Buffer.from(data, "utf8") : data);
  signer.end();
  return signer.sign(privateKey).toString("base64");
}

export function generateTestKeyPair(): {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return {
    publicKey,
    privateKey,
    fingerprint: computeFingerprint(publicKey),
  };
}

export interface EncryptedEnvelope {
  envelopeCiphertext: string;
  envelopeIv: string;
  envelopeTag: string;
  evidenceHash: string;
}

export function encryptEvidenceEnvelope(
  data: unknown,
  aadContext: string,
  symmetricKey: Buffer,
): EncryptedEnvelope {
  const serialized = JSON.stringify(data);
  const evidenceHash = createHash("sha256").update(serialized).digest("hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", symmetricKey, iv);
  cipher.setAAD(Buffer.from(aadContext, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(serialized, "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    envelopeCiphertext: ciphertext.toString("base64"),
    envelopeIv: iv.toString("base64"),
    envelopeTag: tag.toString("base64"),
    evidenceHash,
  };
}

export function decryptEvidenceEnvelope(
  envelope: {
    envelopeCiphertext: string;
    envelopeIv: string;
    envelopeTag: string;
  },
  aadContext: string,
  symmetricKey: Buffer,
): unknown {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    symmetricKey,
    Buffer.from(envelope.envelopeIv, "base64"),
  );
  decipher.setAAD(Buffer.from(aadContext, "utf8"));
  decipher.setAuthTag(Buffer.from(envelope.envelopeTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.envelopeCiphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8"));
}
