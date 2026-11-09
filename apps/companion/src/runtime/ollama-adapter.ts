export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: {
    function: {
      name: string;
      arguments: Record<string, unknown>;
    };
  }[];
}

export interface OllamaToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface OllamaChatResponse {
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

export interface OllamaTransport {
  chat(
    baseUrl: string,
    payload: {
      model: string;
      messages: OllamaMessage[];
      tools?: OllamaToolDefinition[];
      stream?: boolean;
      options?: Record<string, unknown>;
    },
    signal?: AbortSignal,
  ): Promise<OllamaChatResponse>;
  checkHealth(baseUrl: string, signal?: AbortSignal): Promise<boolean>;
}

export class DefaultOllamaTransport implements OllamaTransport {
  async chat(
    baseUrl: string,
    payload: {
      model: string;
      messages: OllamaMessage[];
      tools?: OllamaToolDefinition[];
      stream?: boolean;
      options?: Record<string, unknown>;
    },
    signal?: AbortSignal,
  ): Promise<OllamaChatResponse> {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, stream: false }),
      signal,
    });

    if (!res.ok) {
      throw new Error(`Ollama Error (${res.status}): ${await res.text()}`);
    }

    return (await res.json()) as OllamaChatResponse;
  }

  async checkHealth(baseUrl: string, signal?: AbortSignal): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl}/api/tags`, { method: "GET", signal });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const GROUNDED_TOOL_DEFINITIONS: OllamaToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_spend_summary",
      description:
        "Get categorized spending totals, transaction count, and date coverage from permitted accounts.",
      parameters: {
        type: "object",
        properties: {
          categoryIds: {
            type: "array",
            items: { type: "string" },
            description: "Optional category filter IDs",
          },
          startDate: {
            type: "string",
            description: "ISO date filter start (YYYY-MM-DD)",
          },
          endDate: {
            type: "string",
            description: "ISO date filter end (YYYY-MM-DD)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recurring_costs",
      description:
        "Identify recurring expenses, subscription cadences, and monthly totals from permitted transaction history.",
      parameters: {
        type: "object",
        properties: {
          lookbackMonths: {
            type: "number",
            description: "Lookback window in months (1-12)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "project_goal",
      description:
        "Calculate deterministic goal timeline, target date, and feasibility based on mathematical compounding.",
      parameters: {
        type: "object",
        properties: {
          currentSavingsMinor: {
            type: "string",
            description: "Current savings balance in minor units",
          },
          monthlyContributionMinor: {
            type: "string",
            description: "Monthly contribution amount in minor units",
          },
          targetAmountMinor: {
            type: "string",
            description: "Target goal amount in minor units",
          },
          annualRateBps: {
            type: "number",
            description:
              "Annual interest rate in basis points (e.g. 400 for 4%)",
          },
        },
        required: [
          "currentSavingsMinor",
          "monthlyContributionMinor",
          "targetAmountMinor",
        ],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_goal_scenarios",
      description:
        "Compare two goal contribution scenarios to quantify months difference and required contribution delta.",
      parameters: {
        type: "object",
        properties: {
          baseline: {
            type: "object",
            description: "Baseline scenario parameters",
          },
          alternative: {
            type: "object",
            description: "Alternative scenario parameters",
          },
        },
        required: ["baseline", "alternative"],
      },
    },
  },
];

export interface OllamaAdapterOptions {
  baseUrl?: string;
  model?: string;
  transport?: OllamaTransport;
}

export class OllamaAdapter {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly transport: OllamaTransport;

  constructor(options: OllamaAdapterOptions = {}) {
    const rawUrl = options.baseUrl || "http://127.0.0.1:11434";
    // Strict loopback validation
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:") {
      throw new Error(
        `Ollama loopback security violation: protocol must be http:, received "${parsed.protocol}".`,
      );
    }
    const isLoopback =
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "[::1]" ||
      parsed.hostname === "::1";

    if (!isLoopback) {
      throw new Error(
        `Ollama loopback security violation: host must be loopback (127.0.0.1, localhost, or [::1]), received "${parsed.hostname}". Cloud endpoints are prohibited.`,
      );
    }
    this.baseUrl = rawUrl.replace(/\/+$/, "");
    this.model = options.model || "gemma4:e4b-it-q4_K_M";
    this.transport = options.transport || new DefaultOllamaTransport();
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getModel(): string {
    return this.model;
  }

  async isHealthy(signal?: AbortSignal): Promise<boolean> {
    return this.transport.checkHealth(this.baseUrl, signal);
  }

  async chat(
    messages: OllamaMessage[],
    tools: OllamaToolDefinition[] = GROUNDED_TOOL_DEFINITIONS,
    signal?: AbortSignal,
  ): Promise<OllamaChatResponse> {
    return this.transport.chat(
      this.baseUrl,
      {
        model: this.model,
        messages,
        tools,
        stream: false,
        options: {
          num_ctx: 4096, // 4,096-token context limit per spec
          temperature: 0.1, // low temperature for deterministic insights
        },
      },
      signal,
    );
  }
}
