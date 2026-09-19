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
  const now = new Date().toISOString();
  db.query("INSERT INTO users(id, display_name, spectrum_sender_id, status, created_at, updated_at) VALUES ('user-1', 'Owner', '+12025550999', 'active', ?, ?)").run(now, now);
  db.query("INSERT INTO mailboxes(id, user_id, email, source, status, consent_confirmed_at, created_at, updated_at) VALUES ('mailbox-1', 'user-1', 'owner@example.com', 'mock', 'active', ?, ?, ?)").run(now, now, now);
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
    const owner = { userId: "user-1", mailboxId: "mailbox-1" };
    archiveEmail(db, owner, input);
    archiveEmail(db, owner, { ...input, normalizedBody: "Would Saturday dinner somewhere quiet work instead?" });

    expect((db.query("SELECT count(*) AS n FROM email_messages").get() as { n: number }).n).toBe(1);
    expect(searchEmail(db, "user-1", "Maya dinner")).toHaveLength(1);
    expect(searchEmail(db, "user-1", "Saturday")[0]?.subject).toBe("Quiet dinner plans");
    expect(searchEmailHybrid(db, "user-1", "Saturday")[0]?.retrieval).toBe("keyword");
    expect(getThread(db, "user-1", "thread-1")[0]?.body).toContain("Saturday");
    expect(rebuildEmailFts(db)).toBe(1);
  });
});

describe("durable memory lifecycle", () => {
  test("remembers, corrects, forgets, and suppresses unchanged extraction", () => {
    archiveEmail(db, { userId: "user-1", mailboxId: "mailbox-1" }, {
      providerMessageId: "gmail-1", providerThreadId: "thread-1", mailboxEmail: "owner@example.com",
      internalDateMs: Date.parse("2026-09-01T10:00:00Z"), sender: "Owner <owner@example.com>",
      recipients: ["Friend <friend@example.com>"], subject: "Dinner", normalizedBody: "I prefer quiet restaurants.",
    });
    const evidence = [{ type: "email" as const, id: "gmail-1" }];
    const first = createMemory(db, "user-1", {
      kind: "preference",
      claim: "Prefers quiet restaurants",
      evidence,
      origin: "email-extracted",
    }).memory!;
    expect(searchMemories(db, "user-1", "quiet restaurants")[0]?.id).toBe(first.id);

    recordChatMessage(db, { userId: "user-1", providerMessageId: "chat-2", conversationId: "chat-1", senderId: "+12025550999", direction: "inbound", content: "Actually, lively restaurants", processingStatus: "processed" });
    const corrected = correctMemory(db, "user-1", first.id, {
      kind: "preference",
      claim: "Prefers lively restaurants",
      evidence: [{ type: "chat", id: "chat-2" }],
    });
    expect(searchMemories(db, "user-1", "quiet restaurants").some((memory) => memory.id === first.id)).toBe(false);
    expect(searchMemories(db, "user-1", "lively restaurants")[0]?.id).toBe(corrected.id);

    expect(forgetMemory(db, "user-1", corrected.id)).toBe(true);
    expect(searchMemories(db, "user-1", "lively restaurants")).toHaveLength(0);

    const extracted = createMemory(db, "user-1", {
      kind: "preference",
      claim: "Prefers lively restaurants",
      evidence: [{ type: "chat", id: "chat-2" }],
      origin: "email-extracted",
    });
    expect(extracted.suppressed).toBe(true);
  });

  test("rejects credential-like claims extracted from email", () => {
    expect(() => createMemory(db, "user-1", {
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
      userId: "user-1",
      providerMessageId: "imessage-1",
      conversationId: "chat-1",
      senderId: "+14155550123",
      direction: "inbound" as const,
      content: "Remember this",
      processingStatus: "processed" as const,
    };
    expect(recordChatMessage(db, message)).toBe(true);
    expect(recordChatMessage(db, message)).toBe(false);
    expect(recentChatHistory(db, "user-1", "chat-1")).toEqual([
      expect.objectContaining({ direction: "inbound", content: "Remember this" }),
    ]);
  });

  test("persists history across a close and reopen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dnm-storage-test-"));
    const path = join(directory, "history.sqlite");
    try {
      const first = await openDatabase({ path });
      const now = new Date().toISOString();
      first.query("INSERT INTO users(id, display_name, spectrum_sender_id, status, created_at, updated_at) VALUES ('user-1', 'Owner', '+12025550999', 'active', ?, ?)").run(now, now);
      recordChatMessage(first, {
        userId: "user-1",
        providerMessageId: "persisted-1",
        conversationId: "chat-persisted",
        senderId: "+14155550123",
        direction: "inbound",
        content: "Still here",
        processingStatus: "processed",
      });
      first.close(false);

      const reopened = await openDatabase({ path });
      expect(recentChatHistory(reopened, "user-1", "chat-persisted")[0]?.content).toBe("Still here");
      reopened.close(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
