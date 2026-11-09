import type { CompanionClient } from "../api/companion-client.js";
import type { CompanionKeyStore } from "../crypto/key-store.js";
import { type OllamaAdapter, type OllamaMessage } from "./ollama-adapter.js";
import {
  type DecryptedEvidencePayload,
  ToolGateway,
} from "../tools/tool-gateway.js";

export interface JobRunnerOptions {
  client: CompanionClient;
  keyStore: CompanionKeyStore;
  ollama: OllamaAdapter;
  envelopeKey: Buffer;
  timeoutMs?: number;
}

export interface JobExecutionResult {
  jobId: string;
  status: "COMPLETED" | "FAILED" | "ABORTED";
  reason?: string;
  toolRounds: number;
  resultPayload?: unknown;
}

export class CompanionJobRunner {
  private readonly client: CompanionClient;
  private readonly keyStore: CompanionKeyStore;
  private readonly ollama: OllamaAdapter;
  private readonly envelopeKey: Buffer;
  private readonly timeoutMs: number;

  constructor(options: JobRunnerOptions) {
    this.client = options.client;
    this.keyStore = options.keyStore;
    this.ollama = options.ollama;
    this.envelopeKey = options.envelopeKey;
    this.timeoutMs = options.timeoutMs || 120_000; // 2 minutes default cap
  }

  async processJob(
    jobId: string,
    deviceId: string,
    leaseToken: string,
  ): Promise<JobExecutionResult> {
    const startTime = Date.now();

    // 1. Fetch encrypted evidence envelope
    const envelope = await this.client.getEvidenceEnvelope(jobId);

    // 2. Check fresh online execution permit before decryption and model execution
    const permit = await this.client.checkPermit(jobId, { leaseToken });
    if (!permit.permitted) {
      return {
        jobId,
        status: "ABORTED",
        reason: `Online execution permit denied: ${permit.reason || "UNKNOWN"}`,
        toolRounds: 0,
      };
    }

    if (
      permit.currentGrantVersion !== undefined &&
      permit.currentGrantVersion !== envelope.grantVersion
    ) {
      return {
        jobId,
        status: "ABORTED",
        reason: `Account grant version changed (envelope=${envelope.grantVersion}, current=${permit.currentGrantVersion})`,
        toolRounds: 0,
      };
    }

    // 3. Decrypt evidence envelope with AAD context binding
    const aadContext = `${jobId}:${deviceId}:${envelope.audienceScope}:${envelope.grantVersion}`;
    let decryptedEvidence: DecryptedEvidencePayload;

    try {
      const decrypted = this.keyStore.decryptEnvelope<DecryptedEvidencePayload>(
        envelope.envelopeCiphertext,
        envelope.envelopeIv,
        envelope.envelopeTag,
        aadContext,
        this.envelopeKey,
      );

      if (decrypted.evidenceHash !== envelope.evidenceHash) {
        return {
          jobId,
          status: "FAILED",
          reason: `Evidence hash mismatch: calculated ${decrypted.evidenceHash} but envelope declared ${envelope.evidenceHash}`,
          toolRounds: 0,
        };
      }

      decryptedEvidence = decrypted.data;
    } catch (err) {
      return {
        jobId,
        status: "FAILED",
        reason: `Evidence envelope decryption failed: ${(err as Error).message}`,
        toolRounds: 0,
      };
    }

    // 4. Initialize grounded tool gateway with decrypted evidence
    const gateway = new ToolGateway(decryptedEvidence);

    // 5. Construct conversation messages
    const messages: OllamaMessage[] = [
      {
        role: "system",
        content:
          "You are the Joint App local financial assistant on the user's Mac. " +
          "You only explain verified calculations and facts. " +
          "Never guess, speculate, or fabricate figures. Always call the provided tools to obtain numbers. " +
          "Keep answers concise, accurate, and helpful.",
      },
      {
        role: "user",
        content: `Please analyze the financial evidence for this ${envelope.audienceScope.toLowerCase()} request.`,
      },
    ];

    let finalAssistantText = "";
    let completedTurn = false;
    let rounds = 0;
    const maxRounds = 4;

    // 6. Execute bounded model loop (max 4 tool rounds or timeout)
    while (rounds < maxRounds) {
      if (Date.now() - startTime > this.timeoutMs) {
        return {
          jobId,
          status: "FAILED",
          reason: "Execution timed out (2-minute limit exceeded).",
          toolRounds: gateway.getRoundCount(),
        };
      }

      const res = await this.ollama.chat(messages);
      const assistantMessage = res.message;
      messages.push(assistantMessage);

      // If model returned tool calls, execute each through the gateway
      if (
        assistantMessage.tool_calls &&
        assistantMessage.tool_calls.length > 0
      ) {
        rounds++;
        for (const call of assistantMessage.tool_calls) {
          try {
            const toolOutput = gateway.executeTool(
              call.function.name,
              call.function.arguments,
            );
            messages.push({
              role: "tool",
              content: JSON.stringify(toolOutput),
            });
          } catch (toolErr) {
            messages.push({
              role: "tool",
              content: JSON.stringify({ error: (toolErr as Error).message }),
            });
          }
        }
      } else {
        // No more tool calls; assistant completed its response
        finalAssistantText = assistantMessage.content;
        completedTurn = true;
        break;
      }
    }

    if (!completedTurn) {
      return {
        jobId,
        status: "FAILED",
        reason: "MAX_ROUNDS_EXCEEDED",
        toolRounds: gateway.getRoundCount(),
      };
    }

    if (!finalAssistantText && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last && last.role === "assistant") {
        finalAssistantText = last.content;
      }
    }

    // 7. Assemble structured result payload
    const resultPayload = {
      summary: finalAssistantText || "Analysis complete.",
      toolRounds: gateway.getRoundCount(),
      completedAt: new Date().toISOString(),
    };

    // 8. Sign evidenceHash:JSON.stringify(resultPayload)
    const payloadBytes =
      envelope.evidenceHash + ":" + JSON.stringify(resultPayload);
    const signature = this.keyStore.sign(payloadBytes);

    // 9. Submit result to API
    try {
      await this.client.completeJob(jobId, {
        leaseToken,
        evidenceHash: envelope.evidenceHash,
        grantVersion: envelope.grantVersion,
        resultPayload,
        signature,
      });

      return {
        jobId,
        status: "COMPLETED",
        toolRounds: gateway.getRoundCount(),
        resultPayload,
      };
    } catch (submitErr) {
      return {
        jobId,
        status: "FAILED",
        reason: `Job completion rejected by server: ${(submitErr as Error).message}`,
        toolRounds: gateway.getRoundCount(),
      };
    }
  }

  async claimAndExecuteNextJob(
    deviceId: string,
  ): Promise<JobExecutionResult | null> {
    const claim = await this.client.claimJob({
      deviceId,
      maxBatchSize: 1,
    });

    if (!claim.claimedJob || !claim.leaseToken) {
      return null;
    }

    return this.processJob(claim.claimedJob.id, deviceId, claim.leaseToken);
  }
}
