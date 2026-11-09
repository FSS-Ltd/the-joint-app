export {
  CompanionKeyStore,
  type KeyPair,
  type DeviceIdentity,
  type DecryptedEnvelope,
} from "./crypto/key-store.js";

export {
  CompanionClient,
  type CompanionClientOptions,
} from "./api/companion-client.js";

export {
  ToolGateway,
  type DecryptedEvidencePayload,
  type DecryptedAccountEvidence,
  type SpendSummaryInput,
  type SpendSummaryResult,
  type RecurringCostsInput,
  type RecurringCostsResult,
  type ProjectGoalInput,
  type ProjectGoalResult,
  type CompareScenariosInput,
  type CompareScenariosResult,
} from "./tools/tool-gateway.js";

export {
  OllamaAdapter,
  GROUNDED_TOOL_DEFINITIONS,
  type OllamaMessage,
  type OllamaToolDefinition,
  type OllamaChatResponse,
  type OllamaTransport,
  type OllamaAdapterOptions,
} from "./runtime/ollama-adapter.js";

export {
  CompanionJobRunner,
  type JobRunnerOptions,
  type JobExecutionResult,
} from "./runtime/job-runner.js";

export { runCli } from "./cli.js";
