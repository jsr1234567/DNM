export const DEFAULT_OPENROUTER_MODEL = "google/gemini-3.8-flash";

export type JsonSchema = Record<string, unknown>;

export interface StructuredCompletionRequest {
  name: string;
  schema: JsonSchema;
  system: string;
  prompt: string;
  maxTokens?: number;
}

export interface StructuredCompletionClient {
  complete<T>(request: StructuredCompletionRequest): Promise<T>;
  readonly model: string;
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
}

export class OpenRouterClient implements StructuredCompletionClient {
  readonly model: string;
  private readonly apiKey: string;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
    this.model = options.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL;
    if (!this.apiKey) {
      throw new Error("Missing OPENROUTER_API_KEY. Add it to the project-local .env file.");
    }
  }

  async complete<T>(request: StructuredCompletionRequest): Promise<T> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "DNM local hackathon POC",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
        temperature: 0,
        max_completion_tokens: request.maxTokens ?? 2_000,
        provider: { require_parameters: true },
        response_format: {
          type: "json_schema",
          json_schema: {
            name: request.name,
            strict: true,
            schema: request.schema,
          },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    const payload = await response.json() as OpenRouterResponse;
    if (!response.ok) {
      throw new Error(`OpenRouter request failed (${response.status}): ${payload.error?.message ?? "unknown error"}`);
    }
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter returned an empty structured response");
    try {
      return JSON.parse(content) as T;
    } catch {
      throw new Error("OpenRouter returned invalid JSON despite structured-output mode");
    }
  }
}
