import { describe, expect, test } from "bun:test";
import { OpenRouterClient, parseStructuredContent } from "../src/ai/openrouter.ts";

describe("OpenRouter structured response parsing", () => {
  test("accepts strict and fenced JSON", () => {
    expect(parseStructuredContent<{ reply: string }>(`{"reply":"hello"}`, "imessage_reply"))
      .toEqual({ reply: "hello" });
    expect(parseStructuredContent<{ reply: string }>(
      "```json\n{\"reply\":\"hello\"}\n```",
      "imessage_reply",
    )).toEqual({ reply: "hello" });
  });

  test("extracts a JSON object wrapped in provider prose", () => {
    expect(parseStructuredContent<{ reply: string }>(
      `Here is the result: {"reply":"hello"}`,
      "imessage_reply",
    )).toEqual({ reply: "hello" });
  });

  test("uses plain text only for the iMessage reply schema", () => {
    expect(parseStructuredContent<{ reply: string }>("Hello from Froggie", "imessage_reply"))
      .toEqual({ reply: "Hello from Froggie" });
    expect(() => parseStructuredContent("not json", "bounty_candidates"))
      .toThrow("invalid JSON");
  });

  test("retries malformed JSON with explicit schema feedback", async () => {
    const requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    const responses = ["{", `{"items":[]}`];
    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "test-model",
      fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
        requests.push(JSON.parse(String(init?.body)));
        const content = responses.shift();
        return Response.json({ choices: [{ message: { content } }] });
      }) as typeof fetch,
    });

    const result = await client.complete<{ items: unknown[] }>({
      name: "bounty_candidates",
      schema: {
        type: "object",
        properties: { items: { type: "array" } },
        required: ["items"],
        additionalProperties: false,
      },
      system: "Return candidates.",
      prompt: "Find candidates.",
    });

    expect(result).toEqual({ items: [] });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages.at(-1)?.content).toContain("could not be parsed");
    expect(requests[1]?.messages.at(-1)?.content).toContain("Required schema");
  });
});
