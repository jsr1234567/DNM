import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import type {
  StructuredCompletionClient,
  StructuredCompletionRequest,
} from "../src/ai/openrouter.ts";
import { generateSessionReply, loadSessionContext } from "../src/agent/respond.ts";
import { recordChatMessage } from "../src/chat/history.ts";
import { openDatabase } from "../src/db/index.ts";
import { archiveEmail } from "../src/email/archive.ts";
import { createMemory } from "../src/memory/index.ts";

class FakeCompletionClient implements StructuredCompletionClient {
  readonly model = "fake";
  request?: StructuredCompletionRequest;

  async complete<T>(request: StructuredCompletionRequest): Promise<T> {
    this.request = request;
    return { reply: "Dinner is planned for Friday." } as T;
  }
}

describe("single-turn iMessage response context", () => {
  let db: Database;

  beforeEach(async () => {
    db = await openDatabase({ path: ":memory:" });
  });

  afterEach(() => db.close(false));

  test("uses the latest three user messages, active memories, and latest three emails", async () => {
    for (let index = 1; index <= 4; index += 1) {
      recordChatMessage(db, {
        providerMessageId: `chat-${index}`,
        conversationId: "conversation-1",
        senderId: "user-1",
        direction: "inbound",
        content: `user message ${index}`,
        occurredAt: `2026-09-0${index}T12:00:00.000Z`,
        processingStatus: "processed",
      });
    }

    createMemory(db, {
      kind: "preference",
      claim: "The user prefers quiet restaurants",
      origin: "user-stated",
    });

    for (let index = 1; index <= 4; index += 1) {
      archiveEmail(db, {
        providerMessageId: `email-${index}`,
        providerThreadId: `thread-${index}`,
        mailboxEmail: "owner@example.com",
        internalDateMs: Date.parse(`2026-09-1${index}T12:00:00.000Z`),
        sender: "Maya <maya@example.com>",
        recipients: ["Owner <owner@example.com>"],
        subject: `email subject ${index}`,
        normalizedBody: `email body ${index}`,
      });
    }

    const context = loadSessionContext(db, "conversation-1");
    expect(context.userMessages.map((message) => message.content)).toEqual([
      "user message 2",
      "user message 3",
      "user message 4",
    ]);
    expect(context.memories.map((memory) => memory.claim)).toEqual([
      "The user prefers quiet restaurants",
    ]);
    expect(context.emails.map((email) => email.subject)).toEqual([
      "email subject 4",
      "email subject 3",
      "email subject 2",
    ]);

    const client = new FakeCompletionClient();
    await expect(generateSessionReply(db, client, "conversation-1")).resolves.toBe(
      "Dinner is planned for Friday.",
    );
    expect(client.request?.prompt).toContain("user message 4");
    expect(client.request?.prompt).not.toContain("user message 1");
    expect(client.request?.system).toContain("untrusted data");
  });
});
