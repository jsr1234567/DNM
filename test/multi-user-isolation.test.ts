import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { loadSessionContext } from "../src/agent/respond.ts";
import { recordChatMessage, recentChatHistory } from "../src/chat/history.ts";
import { openDatabase } from "../src/db/index.ts";
import { searchEmail } from "../src/email/search.ts";
import { seedMockMailboxes } from "../src/email/mock/seed.ts";
import { createMemory, listActiveMemories, searchMemories } from "../src/memory/index.ts";
import { resolveInboundUser } from "../src/users/index.ts";

describe("multi-user privacy boundaries", () => {
  let db: Database;
  beforeEach(async () => {
    db = await openDatabase({ path: ":memory:" });
    await seedMockMailboxes(db, new Date("2026-09-19T12:00:00Z"));
  });
  afterEach(() => db.close(false));

  test("scopes email, memory, chat, and assistant context to the resolved user", () => {
    const alex = "fixture:freelance-caregiver";
    const casey = "fixture:social-organizer";
    createMemory(db, alex, { kind: "preference", claim: "Alex prefers the blue entrance",
      origin: "user-stated" });
    createMemory(db, casey, { kind: "preference", claim: "Casey prefers the emerald doorway",
      origin: "user-stated" });
    recordChatMessage(db, { userId: alex, providerMessageId: "alex-private-chat", conversationId: "shared-looking-id",
      senderId: "+12025550103", direction: "inbound", content: "Alex private phrase", processingStatus: "processed" });
    recordChatMessage(db, { userId: casey, providerMessageId: "casey-private-chat", conversationId: "shared-looking-id",
      senderId: "+12025550101", direction: "inbound", content: "Casey private phrase", processingStatus: "processed" });

    expect(searchEmail(db, alex, "early dismissal").length).toBeGreaterThan(0);
    expect(searchEmail(db, casey, "early dismissal")).toHaveLength(0);
    expect(searchMemories(db, alex, "emerald doorway")).toHaveLength(0);
    expect(listActiveMemories(db, casey).some((item) => item.claim.includes("Alex"))).toBe(false);
    expect(recentChatHistory(db, alex, "shared-looking-id").map((item) => item.content)).toEqual(["Alex private phrase"]);
    const context = loadSessionContext(db, casey, "shared-looking-id");
    expect(JSON.stringify(context)).not.toContain("Alex private phrase");
    expect(JSON.stringify(context)).not.toContain("early dismissal");
  });

  test("rejects foreign evidence and gates unknown, outbound, and group events", () => {
    expect(() => createMemory(db, "fixture:social-organizer", {
      kind: "episode", claim: "Alex has an early-dismissal gap", origin: "email-extracted",
      evidence: [{ type: "email", id: "mock:freelance-caregiver:school-2" }],
    })).toThrow("does not belong");
    const base = { contentType: "text", platform: "imessage", spaceType: "dm", direction: "inbound",
      senderId: "+12025550101" };
    expect(resolveInboundUser(db, base)?.id).toBe("fixture:social-organizer");
    expect(resolveInboundUser(db, { ...base, senderId: "+12025559999" })).toBeUndefined();
    expect(resolveInboundUser(db, { ...base, direction: "outbound" })).toBeUndefined();
    expect(resolveInboundUser(db, { ...base, spaceType: "group" })).toBeUndefined();
  });
});
