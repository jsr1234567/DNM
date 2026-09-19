import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db/index.ts";
import { archiveEmail, rebuildEmailFts } from "../src/email/archive.ts";
import { getThread, searchEmail, searchEmailHybrid } from "../src/email/search.ts";
import {
  correctMemory,
  createMemory,
  forgetMemory,
  searchMemories,
} from "../src/memory/index.ts";
import { recentChatHistory, recordChatMessage } from "../src/chat/history.ts";

let db: Database;

beforeEach(async () => {
  db = await openDatabase({ path: ":memory:" });
});

afterEach(() => db.close(false));

describe("email archive and FTS", () => {
  test("upserts provider messages without duplicates and exposes sourced results", () => {
    const input = {
      providerMessageId: "gmail-1",
      providerThreadId: "thread-1",
      mailboxEmail: "owner@example.com",
      internalDateMs: Date.parse("2026-09-01T10:00:00Z"),
      sentAt: "2026-09-01T10:00:00Z",
      sender: "Maya <maya@example.com>",
      recipients: ["Owner <owner@example.com>"],
      subject: "Quiet dinner plans",
      normalizedBody: "Would Friday dinner somewhere quiet work for you?",
    };
    archiveEmail(db, input);
    archiveEmail(db, { ...input, normalizedBody: "Would Saturday dinner somewhere quiet work instead?" });

    expect((db.query("SELECT count(*) AS n FROM email_messages").get() as { n: number }).n).toBe(1);
    expect(searchEmail(db, "Maya dinner")).toHaveLength(1);
    expect(searchEmail(db, "Saturday")[0]?.subject).toBe("Quiet dinner plans");
    expect(searchEmailHybrid(db, "Saturday")[0]?.retrieval).toBe("keyword");
    expect(getThread(db, "thread-1")[0]?.body).toContain("Saturday");
    expect(rebuildEmailFts(db)).toBe(1);
  });
});

describe("durable memory lifecycle", () => {
  test("remembers, corrects, forgets, and suppresses unchanged extraction", () => {
    const evidence = [{ type: "email" as const, id: "gmail-1" }];
    const first = createMemory(db, {
      kind: "preference",
      claim: "Prefers quiet restaurants",
      evidence,
      origin: "email-extracted",
    }).memory!;
    expect(searchMemories(db, "quiet restaurants")[0]?.id).toBe(first.id);

    const corrected = correctMemory(db, first.id, {
      kind: "preference",
      claim: "Prefers lively restaurants",
      evidence: [{ type: "chat", id: "chat-2" }],
    });
    expect(searchMemories(db, "quiet restaurants").some((memory) => memory.id === first.id)).toBe(false);
    expect(searchMemories(db, "lively restaurants")[0]?.id).toBe(corrected.id);

    expect(forgetMemory(db, corrected.id)).toBe(true);
    expect(searchMemories(db, "lively restaurants")).toHaveLength(0);

    const extracted = createMemory(db, {
      kind: "preference",
      claim: "Prefers lively restaurants",
      evidence: [{ type: "chat", id: "chat-2" }],
      origin: "email-extracted",
    });
    expect(extracted.suppressed).toBe(true);
  });

  test("rejects credential-like claims extracted from email", () => {
    expect(() => createMemory(db, {
      kind: "episode",
      claim: "The verification code is 123456",
      origin: "email-extracted",
      evidence: [{ type: "email", id: "gmail-code" }],
    })).toThrow("Credential-like");
  });
});

describe("chat history", () => {
  test("deduplicates provider events and survives database use", () => {
    const message = {
      providerMessageId: "imessage-1",
      conversationId: "chat-1",
      senderId: "+14155550123",
      direction: "inbound" as const,
      content: "Remember this",
      processingStatus: "processed" as const,
    };
    expect(recordChatMessage(db, message)).toBe(true);
    expect(recordChatMessage(db, message)).toBe(false);
    expect(recentChatHistory(db, "chat-1")).toEqual([
      expect.objectContaining({ direction: "inbound", content: "Remember this" }),
    ]);
  });

  test("persists history across a close and reopen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dnm-storage-test-"));
    const path = join(directory, "history.sqlite");
    try {
      const first = await openDatabase({ path });
      recordChatMessage(first, {
        providerMessageId: "persisted-1",
        conversationId: "chat-persisted",
        senderId: "+14155550123",
        direction: "inbound",
        content: "Still here",
        processingStatus: "processed",
      });
      first.close(false);

      const reopened = await openDatabase({ path });
      expect(recentChatHistory(reopened, "chat-persisted")[0]?.content).toBe("Still here");
      reopened.close(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
