import { describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CompanionKeyStore,
  OllamaAdapter,
  ToolGateway,
  CompanionJobRunner,
  CompanionClient,
  type DecryptedEvidencePayload,
  type OllamaTransport,
  type OllamaMessage,
  type OllamaChatResponse,
} from "../apps/companion/src/index.js";
import { encryptEvidenceEnvelope } from "../apps/api/src/modules/devices/device-crypto.js";

describe("Companion Runtime and Grounded Tools (IOS13b)", () => {
  describe("CompanionKeyStore", () => {
    it("generates RSA keypair and deterministic SHA-256 fingerprint", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "joint-test-keystore-"));
      try {
        const store = new CompanionKeyStore(tempDir);
        const kp = store.getOrCreateKeyPair();

        expect(kp.publicKey).toContain("BEGIN PUBLIC KEY");
        expect(kp.privateKey).toContain("BEGIN PRIVATE KEY");
        expect(kp.fingerprint).toMatch(/^[0-9a-f]{64}$/);

        // Subsequent call reuses the same keypair
        const reloaded = store.getOrCreateKeyPair();
        expect(reloaded.fingerprint).toBe(kp.fingerprint);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("signs data and verifies signatures", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "joint-test-keystore-"));
      try {
        const store = new CompanionKeyStore(tempDir);
        const kp = store.getOrCreateKeyPair();

        const message = "challenge_nonce_20261109";
        const signature = store.sign(message);
        expect(signature.length).toBeGreaterThan(32);

        const valid = store.verify(kp.publicKey, message, signature);
        expect(valid).toBe(true);

        const tampered = store.verify(
          kp.publicKey,
          message + "_tampered",
          signature,
        );
        expect(tampered).toBe(false);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("decrypts AES-256-GCM envelope and verifies AAD context binding", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "joint-test-keystore-"));
      try {
        const store = new CompanionKeyStore(tempDir);
        const symmetricKey = randomBytes(32);
        const aadContext = "job-101:dev-202:HOUSEHOLD:1";
        const payload = {
          jobId: "job-101",
          status: "EVIDENCE_TEST",
          numbers: [100, 200, 300],
        };

        const encrypted = encryptEvidenceEnvelope(
          payload,
          aadContext,
          symmetricKey,
        );

        const decrypted = store.decryptEnvelope<{
          jobId: string;
          status: string;
          numbers: number[];
        }>(
          encrypted.envelopeCiphertext,
          encrypted.envelopeIv,
          encrypted.envelopeTag,
          aadContext,
          symmetricKey,
        );

        expect(decrypted.data).toEqual(payload);
        expect(decrypted.evidenceHash).toBe(encrypted.evidenceHash);

        // Fails if AAD context is tampered
        expect(() => {
          store.decryptEnvelope(
            encrypted.envelopeCiphertext,
            encrypted.envelopeIv,
            encrypted.envelopeTag,
            "job-101:dev-202:HOUSEHOLD:2", // altered grantVersion
            symmetricKey,
          );
        }).toThrow();
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("persists and loads device identity", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "joint-test-keystore-"));
      try {
        const store = new CompanionKeyStore(tempDir);
        expect(store.loadIdentity()).toBeNull();

        const identity = {
          deviceId: "dev-uuid-1",
          name: "Studio Mac",
          fingerprint:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          publicKey: "pem-public-key",
          sessionToken: "session-token-test",
        };

        store.saveIdentity(identity);
        const loaded = store.loadIdentity();
        expect(loaded).toEqual(identity);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("OllamaAdapter & Loopback Security", () => {
    it("enforces loopback-only binding and rejects cloud/remote hosts", () => {
      expect(() => {
        new OllamaAdapter({ baseUrl: "https://api.openai.com/v1" });
      }).toThrow(/loopback security violation/i);

      expect(() => {
        new OllamaAdapter({ baseUrl: "http://192.168.1.50:11434" });
      }).toThrow(/loopback security violation/i);

      expect(() => {
        new OllamaAdapter({ baseUrl: "http://10.0.0.1:11434" });
      }).toThrow(/loopback security violation/i);

      // Loopback hosts allowed
      const adapter1 = new OllamaAdapter({ baseUrl: "http://127.0.0.1:11434" });
      expect(adapter1.getBaseUrl()).toBe("http://127.0.0.1:11434");

      const adapter2 = new OllamaAdapter({ baseUrl: "http://localhost:11434" });
      expect(adapter2.getBaseUrl()).toBe("http://localhost:11434");

      const adapter3 = new OllamaAdapter({ baseUrl: "http://[::1]:11434" });
      expect(adapter3.getBaseUrl()).toBe("http://[::1]:11434");

      expect(() => {
        new OllamaAdapter({ baseUrl: "https://127.0.0.1:11434" });
      }).toThrow(/protocol must be http:/);
    });

    it("communicates through transport and receives tool calls", async () => {
      const mockTransport: OllamaTransport = {
        checkHealth: async () => true,
        chat: async (_url, payload) => {
          expect(payload.model).toBe("gemma4:e4b-it-q4_K_M");
          expect(payload.tools?.length).toBe(4);
          return {
            done: true,
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  function: {
                    name: "get_spend_summary",
                    arguments: {
                      startDate: "2026-10-01",
                      endDate: "2026-10-31",
                    },
                  },
                },
              ],
            },
          };
        },
      };

      const adapter = new OllamaAdapter({
        baseUrl: "http://127.0.0.1:11434",
        transport: mockTransport,
      });

      expect(await adapter.isHealthy()).toBe(true);

      const res = await adapter.chat([
        { role: "user", content: "How much did we spend on groceries?" },
      ]);
      expect(res.message.tool_calls).toHaveLength(1);
      expect(res.message.tool_calls![0]!.function.name).toBe(
        "get_spend_summary",
      );
    });
  });

  describe("Grounded Tool Gateway (4 Read-Only Tools)", () => {
    const mockEvidence: DecryptedEvidencePayload = {
      jobId: "job-uuid-1",
      audienceScope: "HOUSEHOLD",
      grantVersion: 1,
      timestamp: "2026-11-09T18:00:00.000Z",
      accounts: [
        {
          accountId: "acc-totals-only",
          name: "Savings Pot",
          permission: "TOTALS",
          currency: "GBP",
          balances: [
            { amount: "500000", asOfDate: "2026-11-09T00:00:00.000Z" },
          ],
          transactions: [], // no transaction access
        },
        {
          accountId: "acc-current",
          name: "Joint Current",
          permission: "TRANSACTIONS",
          currency: "GBP",
          balances: [
            { amount: "125000", asOfDate: "2026-11-09T00:00:00.000Z" },
          ],
          transactions: [
            // Spending (negative amounts)
            {
              id: "tx-1",
              amount: "-4500",
              description: "Sainsbury's",
              bookedAt: "2026-10-05T12:00:00.000Z",
              categoryId: "cat-groceries",
            },
            {
              id: "tx-2",
              amount: "-3200",
              description: "Sainsbury's",
              bookedAt: "2026-10-12T12:00:00.000Z",
              categoryId: "cat-groceries",
            },
            {
              id: "tx-3",
              amount: "-1499",
              description: "Netflix",
              bookedAt: "2026-09-01T08:00:00.000Z",
              categoryId: "cat-entertainment",
            },
            {
              id: "tx-4",
              amount: "-1499",
              description: "Netflix",
              bookedAt: "2026-10-01T08:00:00.000Z",
              categoryId: "cat-entertainment",
            },
            {
              id: "tx-5",
              amount: "-1499",
              description: "Netflix",
              bookedAt: "2026-11-01T08:00:00.000Z",
              categoryId: "cat-entertainment",
            },
            // Positive (income / refund)
            {
              id: "tx-6",
              amount: "250000",
              description: "Salary",
              bookedAt: "2026-10-25T09:00:00.000Z",
              categoryId: "cat-income",
            },
          ],
        },
      ],
    };

    it("evaluates get_spend_summary with category and date filtering", () => {
      const gateway = new ToolGateway(mockEvidence);

      // All spending
      const summary = gateway.getSpendSummary();
      expect(summary.totalSpentMinor).toBe("12197"); // 4500 + 3200 + 1499*3 = 12197
      expect(summary.transactionCount).toBe(5);

      // Filter by category
      const groceries = gateway.getSpendSummary({
        categoryIds: ["cat-groceries"],
      });
      expect(groceries.totalSpentMinor).toBe("7700"); // 4500 + 3200
      expect(groceries.transactionCount).toBe(2);
      expect(groceries.categories[0]!.categoryId).toBe("cat-groceries");

      // Filter by date range
      const octOnly = gateway.getSpendSummary({
        startDate: "2026-10-01T00:00:00.000Z",
        endDate: "2026-10-31T23:59:59.000Z",
      });
      expect(octOnly.transactionCount).toBe(3); // 2 Sainsbury's + 1 Netflix
    });

    it("evaluates get_recurring_costs detecting cadence and monthly estimate", () => {
      const gateway = new ToolGateway(mockEvidence);
      const recurring = gateway.getRecurringCosts({ lookbackMonths: 3 });

      expect(recurring.recurringCount).toBeGreaterThanOrEqual(1);
      const netflix = recurring.items.find((i) =>
        i.description.includes("netflix"),
      );
      expect(netflix).toBeDefined();
      expect(netflix!.estimatedMonthlyMinor).toBe("1499");
      expect(netflix!.occurrenceCount).toBe(3);
      expect(netflix!.uncertainty).toBe("LOW");
    });

    it("evaluates project_goal reusing deterministic projection engine", () => {
      const gateway = new ToolGateway(mockEvidence);
      const projection = gateway.projectGoal({
        currentSavingsMinor: "100000", // £1,000
        monthlyContributionMinor: "20000", // £200/mo
        targetAmountMinor: "300000", // £3,000 target
        annualRateBps: 0, // basic linear saving
        horizonMonths: 24,
      });

      expect(projection.isFeasible).toBe(true);
      // (£3,000 - £1,000) / £200 = 10 months
      expect(projection.projectedMonths).toBe(10);
      expect(projection.targetDateEstimate).toBeDefined();
    });

    it("evaluates compare_goal_scenarios to determine delta savings", () => {
      const gateway = new ToolGateway(mockEvidence);
      const comparison = gateway.compareGoalScenarios({
        baseline: {
          currentSavingsMinor: "100000",
          monthlyContributionMinor: "10000", // £100/mo
          targetAmountMinor: "300000",
          annualRateBps: 0,
        },
        alternative: {
          currentSavingsMinor: "100000",
          monthlyContributionMinor: "20000", // £200/mo
          targetAmountMinor: "300000",
          annualRateBps: 0,
        },
      });

      expect(comparison.baselineMonths).toBe(20);
      expect(comparison.alternativeMonths).toBe(10);
      expect(comparison.monthsDifference).toBe(-10); // 10 months faster
      expect(comparison.contributionDifferenceMinor).toBe("10000"); // +£100/mo
      expect(gateway.getRoundCount()).toBe(1);
    });

    it("enforces hard limit of 4 tool execution rounds", () => {
      const gateway = new ToolGateway(mockEvidence);
      gateway.getSpendSummary(); // round 1
      gateway.getRecurringCosts(); // round 2
      gateway.getSpendSummary(); // round 3
      gateway.getSpendSummary(); // round 4

      expect(gateway.getRoundCount()).toBe(4);

      // 5th tool execution throws error
      expect(() => {
        gateway.getSpendSummary();
      }).toThrow(/exceeded maximum round limit of 4/i);
    });

    it("rejects unpermitted or arbitrary tool invocations", () => {
      const gateway = new ToolGateway(mockEvidence);
      expect(() => {
        gateway.executeTool("execute_sql", { query: "SELECT * FROM users" });
      }).toThrow(/Tool "execute_sql" is not permitted/i);

      expect(() => {
        gateway.executeTool("fetch_url", { url: "https://evil.com" });
      }).toThrow(/Tool "fetch_url" is not permitted/i);
    });
  });

  describe("CompanionJobRunner Orchestration", () => {
    it("executes claimed job with grounded tool calls and submits signed result", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "joint-runner-test-"));
      try {
        const keyStore = new CompanionKeyStore(tempDir);
        const keypair = keyStore.getOrCreateKeyPair();
        const envelopeKey = createHash("sha256")
          .update("test_envelope_seed")
          .digest();

        const evidencePayload: DecryptedEvidencePayload = {
          jobId: "job-runner-1",
          audienceScope: "PERSONAL",
          grantVersion: 1,
          timestamp: new Date().toISOString(),
          accounts: [
            {
              accountId: "acc-1",
              name: "Personal Current",
              permission: "TRANSACTIONS",
              currency: "GBP",
              balances: [
                { amount: "200000", asOfDate: new Date().toISOString() },
              ],
              transactions: [
                {
                  id: "tx-1",
                  amount: "-5000",
                  description: "Tesco",
                  bookedAt: new Date().toISOString(),
                },
              ],
            },
          ],
        };

        const aadContext = `job-runner-1:dev-runner-1:PERSONAL:1`;
        const encryptedEnvelope = encryptEvidenceEnvelope(
          evidencePayload,
          aadContext,
          envelopeKey,
        );

        let completedJobPayload: unknown = null;
        let submittedSignature: string | null = null;

        // Mock CompanionClient
        const mockClient = {
          claimJob: async () => ({
            claimedJob: {
              id: "job-runner-1",
              status: "LEASED",
              featureType: "SPEND_SUMMARY",
            },
            leaseToken: "lease_token_valid_123",
          }),
          getEvidenceEnvelope: async () => ({
            jobId: "job-runner-1",
            deviceId: "dev-runner-1",
            audienceScope: "PERSONAL" as const,
            grantVersion: 1,
            envelopeCiphertext: encryptedEnvelope.envelopeCiphertext,
            envelopeIv: encryptedEnvelope.envelopeIv,
            envelopeTag: encryptedEnvelope.envelopeTag,
            evidenceHash: encryptedEnvelope.evidenceHash,
            expiresAt: new Date(Date.now() + 900000).toISOString(),
          }),
          checkPermit: async () => ({
            permitted: true,
            currentGrantVersion: 1,
          }),
          completeJob: async (
            _jobId: string,
            req: {
              leaseToken: string;
              evidenceHash: string;
              grantVersion: number;
              resultPayload: unknown;
              signature: string;
            },
          ) => {
            completedJobPayload = req.resultPayload;
            submittedSignature = req.signature;
            return {
              jobId: "job-runner-1",
              status: "AVAILABLE",
              availableAt: new Date().toISOString(),
            };
          },
        };

        // Mock Ollama transport that calls get_spend_summary on round 1 and returns answer on round 2
        let callCount = 0;
        const mockTransport: OllamaTransport = {
          checkHealth: async () => true,
          chat: async (_url, payload) => {
            callCount++;
            if (callCount === 1) {
              return {
                done: true,
                message: {
                  role: "assistant",
                  content: "",
                  tool_calls: [
                    {
                      function: {
                        name: "get_spend_summary",
                        arguments: {},
                      },
                    },
                  ],
                },
              };
            } else {
              // Verify assistant received tool response in messages
              const toolMsg = payload.messages.find(
                (m: OllamaMessage) => m.role === "tool",
              );
              expect(toolMsg).toBeDefined();

              return {
                done: true,
                message: {
                  role: "assistant",
                  content:
                    "Your total spending in this period is £50.00 across 1 transaction.",
                },
              };
            }
          },
        };

        const ollama = new OllamaAdapter({
          baseUrl: "http://127.0.0.1:11434",
          transport: mockTransport,
        });

        const runner = new CompanionJobRunner({
          client: mockClient as unknown as CompanionClient,
          keyStore,
          ollama,
          envelopeKey,
        });

        const result = await runner.claimAndExecuteNextJob("dev-runner-1");
        expect(result).not.toBeNull();
        expect(result!.status).toBe("COMPLETED");
        expect(result!.toolRounds).toBe(1);
        expect(completedJobPayload).toBeDefined();

        // Verify signature over evidenceHash:JSON.stringify(resultPayload)
        const expectedBytes =
          encryptedEnvelope.evidenceHash +
          ":" +
          JSON.stringify(completedJobPayload);
        const sigValid = keyStore.verify(
          keypair.publicKey,
          expectedBytes,
          submittedSignature!,
        );
        expect(sigValid).toBe(true);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("halts processing if fresh online permit is denied", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "joint-runner-test-"));
      try {
        const keyStore = new CompanionKeyStore(tempDir);
        const envelopeKey = createHash("sha256").update("test_seed").digest();

        const mockClient = {
          claimJob: async () => ({
            claimedJob: { id: "job-revoked", status: "LEASED" },
            leaseToken: "lease-123",
          }),
          getEvidenceEnvelope: async () => ({
            jobId: "job-revoked",
            deviceId: "dev-1",
            audienceScope: "HOUSEHOLD" as const,
            grantVersion: 1,
            envelopeCiphertext: "dGVzdA==",
            envelopeIv: "dGVzdA==",
            envelopeTag: "dGVzdA==",
            evidenceHash: "hash",
            expiresAt: new Date().toISOString(),
          }),
          checkPermit: async () => ({
            permitted: false,
            reason: "JOB_REVOKED",
            currentGrantVersion: 1,
          }),
        };

        const ollama = new OllamaAdapter({
          transport: {
            checkHealth: async () => true,
            chat: async () => ({}) as unknown as OllamaChatResponse,
          },
        });
        const runner = new CompanionJobRunner({
          client: mockClient as unknown as CompanionClient,
          keyStore,
          ollama,
          envelopeKey,
        });

        const res = await runner.claimAndExecuteNextJob("dev-1");
        expect(res).not.toBeNull();
        expect(res!.status).toBe("ABORTED");
        expect(res!.reason).toContain("JOB_REVOKED");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("halts processing if account grant version changed since envelope creation", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "joint-runner-test-"));
      try {
        const keyStore = new CompanionKeyStore(tempDir);
        const envelopeKey = createHash("sha256").update("test_seed").digest();

        const mockClient = {
          claimJob: async () => ({
            claimedJob: { id: "job-grant-changed", status: "LEASED" },
            leaseToken: "lease-456",
          }),
          getEvidenceEnvelope: async () => ({
            jobId: "job-grant-changed",
            deviceId: "dev-1",
            audienceScope: "HOUSEHOLD" as const,
            grantVersion: 1,
            envelopeCiphertext: "dGVzdA==",
            envelopeIv: "dGVzdA==",
            envelopeTag: "dGVzdA==",
            evidenceHash: "hash",
            expiresAt: new Date().toISOString(),
          }),
          checkPermit: async () => ({
            permitted: true,
            currentGrantVersion: 2, // Modified while queued
          }),
        };

        const ollama = new OllamaAdapter({
          transport: {
            checkHealth: async () => true,
            chat: async () => ({}) as unknown as OllamaChatResponse,
          },
        });
        const runner = new CompanionJobRunner({
          client: mockClient as unknown as CompanionClient,
          keyStore,
          ollama,
          envelopeKey,
        });

        const res = await runner.claimAndExecuteNextJob("dev-1");
        expect(res).not.toBeNull();
        expect(res!.status).toBe("ABORTED");
        expect(res!.reason).toContain("Account grant version changed");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("fails job if decrypted evidenceHash does not match envelope declared hash", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "joint-runner-test-"));
      try {
        const keyStore = new CompanionKeyStore(tempDir);
        const envelopeKey = createHash("sha256").update("test_seed").digest();

        const payload: DecryptedEvidencePayload = {
          jobId: "job-tampered-hash",
          audienceScope: "HOUSEHOLD",
          grantVersion: 1,
          accounts: [],
          timestamp: new Date().toISOString(),
        };

        const aad = "job-tampered-hash:dev-1:HOUSEHOLD:1";
        const encrypted = encryptEvidenceEnvelope(payload, aad, envelopeKey);

        const mockClient = {
          claimJob: async () => ({
            claimedJob: { id: "job-tampered-hash", status: "LEASED" },
            leaseToken: "lease-789",
          }),
          getEvidenceEnvelope: async () => ({
            jobId: "job-tampered-hash",
            deviceId: "dev-1",
            audienceScope: "HOUSEHOLD" as const,
            grantVersion: 1,
            envelopeCiphertext: encrypted.envelopeCiphertext,
            envelopeIv: encrypted.envelopeIv,
            envelopeTag: encrypted.envelopeTag,
            evidenceHash: "mismatched_untrusted_hash_value",
            expiresAt: new Date().toISOString(),
          }),
          checkPermit: async () => ({
            permitted: true,
            currentGrantVersion: 1,
          }),
        };

        const ollama = new OllamaAdapter({
          transport: {
            checkHealth: async () => true,
            chat: async () => ({}) as unknown as OllamaChatResponse,
          },
        });
        const runner = new CompanionJobRunner({
          client: mockClient as unknown as CompanionClient,
          keyStore,
          ollama,
          envelopeKey,
        });

        const res = await runner.claimAndExecuteNextJob("dev-1");
        expect(res).not.toBeNull();
        expect(res!.status).toBe("FAILED");
        expect(res!.reason).toContain("Evidence hash mismatch");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("fails job if model exceeds maximum tool rounds without completing turn", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "joint-runner-test-"));
      try {
        const keyStore = new CompanionKeyStore(tempDir);
        const envelopeKey = createHash("sha256").update("test_seed").digest();

        const payload: DecryptedEvidencePayload = {
          jobId: "job-runaway-rounds",
          audienceScope: "HOUSEHOLD",
          grantVersion: 1,
          accounts: [],
          timestamp: new Date().toISOString(),
        };

        const aad = "job-runaway-rounds:dev-1:HOUSEHOLD:1";
        const encrypted = encryptEvidenceEnvelope(payload, aad, envelopeKey);

        const mockClient = {
          claimJob: async () => ({
            claimedJob: { id: "job-runaway-rounds", status: "LEASED" },
            leaseToken: "lease-rounds",
          }),
          getEvidenceEnvelope: async () => ({
            jobId: "job-runaway-rounds",
            deviceId: "dev-1",
            audienceScope: "HOUSEHOLD" as const,
            grantVersion: 1,
            envelopeCiphertext: encrypted.envelopeCiphertext,
            envelopeIv: encrypted.envelopeIv,
            envelopeTag: encrypted.envelopeTag,
            evidenceHash: encrypted.evidenceHash,
            expiresAt: new Date().toISOString(),
          }),
          checkPermit: async () => ({
            permitted: true,
            currentGrantVersion: 1,
          }),
        };

        // Model that endlessly calls a tool without finishing turn
        const runawayTransport: OllamaTransport = {
          checkHealth: async () => true,
          chat: async () => ({
            done: true,
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  function: {
                    name: "get_spend_summary",
                    arguments: {},
                  },
                },
              ],
            },
          }),
        };

        const ollama = new OllamaAdapter({ transport: runawayTransport });
        const runner = new CompanionJobRunner({
          client: mockClient as unknown as CompanionClient,
          keyStore,
          ollama,
          envelopeKey,
        });

        const res = await runner.claimAndExecuteNextJob("dev-1");
        expect(res).not.toBeNull();
        expect(res!.status).toBe("FAILED");
        expect(res!.reason).toBe("MAX_ROUNDS_EXCEEDED");
        expect(res!.toolRounds).toBe(4);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
