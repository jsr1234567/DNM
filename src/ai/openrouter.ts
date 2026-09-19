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

export class InvalidStructuredResponseError extends Error {
  constructor() {
    super("OpenRouter returned invalid JSON despite structured-output mode");
    this.name = "InvalidStructuredResponseError";
  }
}

export function parseStructuredContent<T>(content: string, name: string): T {
  const trimmed = content.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  if (fenced) candidates.push(fenced);
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of new Set(candidates)) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next safe representation before falling back or failing.
    }
  }
  if (name === "imessage_reply" && trimmed &&
      !trimmed.startsWith("{") && !trimmed.startsWith("[") && !trimmed.startsWith("```")) {
    return { reply: trimmed } as T;
  }
  throw new InvalidStructuredResponseError();
}

export class OpenRouterClient implements StructuredCompletionClient {
  readonly model: string;
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(options: { apiKey?: string; model?: string; fetch?: typeof fetch } = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
    this.model = options.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL;
    this.fetcher = options.fetch ?? fetch;
    if (!this.apiKey) {
      throw new Error("Missing OPENROUTER_API_KEY. Add it to the project-local .env file.");
    }
  }

  async complete<T>(request: StructuredCompletionRequest): Promise<T> {
    const messages = [
      { role: "system", content: request.system },
      { role: "user", content: request.prompt },
    ];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.fetcher("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "DNM local hackathon POC",
        },
        body: JSON.stringify({
          model: this.model,
          messages,
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
        return parseStructuredContent<T>(content, request.name);
      } catch (error) {
        if (!(error instanceof InvalidStructuredResponseError) || attempt === 1) throw error;
        messages.push(
          { role: "assistant", content },
          {
            role: "user",
            content: [
              "Your previous response could not be parsed as JSON matching the required schema.",
              "Return only one valid JSON value. Do not use Markdown fences or explanatory prose.",
              `Required schema: ${JSON.stringify(request.schema)}`,
            ].join(" "),
          },
        );
      }
    }
    throw new InvalidStructuredResponseError();
  }
}
