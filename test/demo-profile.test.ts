import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { bindDemoProfile, resolveDemoProfile } from "../src/demo/profile.ts";
import { openDatabase } from "../src/db/index.ts";
import { seedMockMailboxes } from "../src/email/mock/seed.ts";
import { getUser, resolveUserBySender } from "../src/users/index.ts";
import { loadSessionContext } from "../src/agent/respond.ts";
import { archiveEmail } from "../src/email/archive.ts";

describe("stage demo profile", () => {
  let db: Database;
  beforeEach(async () => {
    db = await openDatabase({ path: ":memory:" });
    await seedMockMailboxes(db, new Date("2026-09-19T12:00:00Z"));
  });
  afterEach(() => db.close(false));

  test("binds a real sender identity to one canonical fixture user", () => {
    const binding = {
      senderId: "+12025550999", email: "stage@example.com",
      personaId: "social-organizer", name: "Stage User",
    };
    const resolved = resolveDemoProfile(db, binding);
    expect(resolved).toEqual(expect.objectContaining({
      userId: "fixture:social-organizer", sourceMailboxEmail: "casey.morgan@example.test",
    }));
    expect(resolveUserBySender(db, binding.senderId)).toBeUndefined();

    bindDemoProfile(db, binding);
    expect(resolveUserBySender(db, binding.senderId)).toEqual(expect.objectContaining({
      id: "fixture:social-organizer", displayName: "Stage User", profileEmail: "stage@example.com",
    }));
    expect(getUser(db, "fixture:social-organizer")?.spectrumSenderId).toBe(binding.senderId);
  });

  test("feeds stage identity and only the canonical user's data to the LLM context", () => {
    bindDemoProfile(db, {
      senderId: "+12025550999", email: "stage@example.com",
      personaId: "social-organizer", name: "Stage User",
    });
    const context = loadSessionContext(db, "fixture:social-organizer", "fixture:casey");
    expect(context.profile).toEqual(expect.objectContaining({
      name: "Stage User", email: "stage@example.com",
    }));
    expect(context.emails.some((email) => email.subject.includes("Dinner"))).toBe(true);
    expect(JSON.stringify(context)).not.toContain("security summary");
    expect(JSON.stringify(context)).not.toContain("early dismissal");
  });

  test("rejects binding a sender already owned by a different user", () => {
    expect(() => bindDemoProfile(db, {
      senderId: "+12025550103", email: "stage@example.com",
      personaId: "social-organizer", name: "Collision",
    })).toThrow("another local user");
  });

  test("binds a sender to an imported Gmail user's canonical scope", () => {
    const now = new Date().toISOString();
    db.query(`INSERT INTO users(id, display_name, spectrum_sender_id, phone, status,
      created_at, updated_at) VALUES ('live-owner', 'Live Owner', '+12025550888', '+12025550888',
      'active', ?, ?)`).run(now, now);
    db.query(`INSERT INTO mailboxes(id, user_id, email, source, status, consent_confirmed_at,
      created_at, updated_at) VALUES ('gmail:live-owner', 'live-owner', 'owner@example.com',
      'gmail', 'active', ?, ?, ?)`).run(now, now, now);
    archiveEmail(db, { userId: "live-owner", mailboxId: "gmail:live-owner" }, {
      providerMessageId: "gmail-live-1", providerThreadId: "gmail-thread-1",
      mailboxEmail: "owner@example.com", internalDateMs: Date.parse("2026-09-19T12:00:00Z"),
      sender: "Friend <friend@example.com>", recipients: ["Owner <owner@example.com>"],
      subject: "Dinner", normalizedBody: "Are we still on for dinner?",
    });
    const profile = bindDemoProfile(db, {
      senderId: "+12025550999", email: "owner@example.com", name: "Stage Owner",
    });
    expect(profile.userId).toBe("live-owner");
    expect(resolveUserBySender(db, "+12025550999")?.id).toBe("live-owner");
    expect(loadSessionContext(db, "live-owner", "live-chat").emails[0]?.subject).toBe("Dinner");
  });
});
