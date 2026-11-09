import { CompanionClient } from "./api/companion-client.js";
import { CompanionKeyStore } from "./crypto/key-store.js";
import { OllamaAdapter } from "./runtime/ollama-adapter.js";
import { CompanionJobRunner } from "./runtime/job-runner.js";
import { createHash } from "node:crypto";

function getEnvelopeKey(): Buffer {
  const secret =
    process.env.COMPANION_ENVELOPE_KEY ||
    process.env.AUTH_TOKEN_SECRET ||
    process.env.DATABASE_URL ||
    "joint_companion_envelope_secure_seed_fallback";
  return createHash("sha256").update(secret).digest();
}

export async function runCli(args: string[]): Promise<void> {
  const command = args[0] || "help";
  const apiUrl = process.env.API_BASE_URL || "http://127.0.0.1:3001";
  const keyStore = new CompanionKeyStore();

  switch (command) {
    case "pair": {
      const codeIdx = args.indexOf("--code");
      const nameIdx = args.indexOf("--name");
      const code = codeIdx !== -1 ? args[codeIdx + 1] : undefined;
      const name =
        (nameIdx !== -1 ? args[nameIdx + 1] : undefined) || "MacBook Companion";

      if (!code) {
        console.error("Error: --code <6-digit-code> is required.");
        process.exit(1);
      }

      const keypair = keyStore.getOrCreateKeyPair();
      console.log(`Device Public Key Fingerprint: ${keypair.fingerprint}`);

      const client = new CompanionClient({ baseUrl: apiUrl });
      const proofOfPossession = keyStore.sign(code);

      try {
        const res = await client.completePairing({
          pairingCode: code,
          name,
          publicKey: keypair.publicKey,
          proofOfPossession,
        });

        keyStore.saveIdentity({
          deviceId: res.deviceId,
          name,
          fingerprint: res.fingerprint,
          publicKey: keypair.publicKey,
        });

        console.log(`Pairing completed! Device ID: ${res.deviceId}`);
        console.log(
          "Next step: An adult in the household must approve this device in the app.",
        );
      } catch (err) {
        console.error(`Pairing failed: ${(err as Error).message}`);
        process.exit(1);
      }
      break;
    }

    case "status": {
      const identity = keyStore.loadIdentity();
      if (!identity) {
        console.log(
          "No paired companion identity found. Run `joint-companion pair --code <code>` first.",
        );
        return;
      }

      console.log("Companion Device Status:");
      console.log(`  Device ID:    ${identity.deviceId}`);
      console.log(`  Name:         ${identity.name}`);
      console.log(`  Fingerprint:  ${identity.fingerprint}`);
      console.log(
        `  Session:      ${identity.sessionToken ? "Active" : "Not authenticated"}`,
      );
      break;
    }

    case "run": {
      const identity = keyStore.loadIdentity();
      if (!identity) {
        console.error("Error: Device is not paired. Run `pair` first.");
        process.exit(1);
      }

      const client = new CompanionClient({
        baseUrl: apiUrl,
        sessionToken: identity.sessionToken,
      });

      // Authenticate if needed
      try {
        const { nonce } = await client.createSessionChallenge({
          deviceId: identity.deviceId,
        });
        const signature = keyStore.sign(nonce);
        const auth = await client.authenticateSession({
          deviceId: identity.deviceId,
          nonce,
          signature,
        });
        client.setSessionToken(auth.sessionToken);
        identity.sessionToken = auth.sessionToken;
        identity.sessionExpiresAt = auth.expiresAt;
        keyStore.saveIdentity(identity);
        console.log(`Session authenticated until ${auth.expiresAt}.`);
      } catch (err) {
        console.error(
          `Authentication challenge failed: ${(err as Error).message}`,
        );
        process.exit(1);
      }

      const ollama = new OllamaAdapter();
      const healthy = await ollama.isHealthy();
      if (!healthy) {
        console.warn(
          "Warning: Ollama at http://127.0.0.1:11434 is unreachable or offline.",
        );
      }

      const runner = new CompanionJobRunner({
        client,
        keyStore,
        ollama,
        envelopeKey: getEnvelopeKey(),
      });

      const once = args.includes("--once");
      console.log(
        `Starting companion job runner (mode: ${once ? "single-run" : "continuous"})...`,
      );

      const result = await runner.claimAndExecuteNextJob(identity.deviceId);
      if (result) {
        console.log(
          `Processed job ${result.jobId}: status=${result.status}, toolsCalled=${result.toolRounds}`,
        );
      } else {
        console.log("No pending jobs found.");
      }
      break;
    }

    default:
      console.log("The Joint App - Local Companion CLI");
      console.log("Commands:");
      console.log("  pair --code <6-digit> [--name <name>]");
      console.log("  run [--once]");
      console.log("  status");
      break;
  }
}

if (
  process.argv[1]?.endsWith("cli.js") ||
  process.argv[1]?.endsWith("cli.ts")
) {
  runCli(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
