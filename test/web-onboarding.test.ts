import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { completeOnboarding } from "../froggie-web/server/onboarding.js";
import { openDatabase } from "../src/db/index.ts";
import { archiveEmail } from "../src/email/archive.ts";

describe("Froggie web onboarding", () => {
  let db: Database;
  beforeEach(async () => { db = await openDatabase({ path: ":memory:" }); });
  afterEach(() => db.close(false));

  test("persists a verified helper as paused until trusted-circle approval", () => {
    const result = completeOnboarding(db, {
      name: "Jordan Helper", email: "jordan@example.test", phone: "+12025550901",
      role: "helper", community: "Oakland, CA", mode: "Both",
      availability: "Mostly weekends", identity: "Nickname",
      skills: ["Website building", "Planning"],
    });
    expect(result.approvalStatus).toBe("pending-circle-approval");
    expect(result.helperMatchingEnabled).toBe(true);
    const user = db.query(`SELECT status, helper_matching_enabled FROM users WHERE id = ?`)
      .get(result.userId) as { status: string; helper_matching_enabled: number };
    expect(user).toEqual({ status: "paused", helper_matching_enabled: 1 });
    const claims = db.query("SELECT claim FROM memories WHERE user_id = ? ORDER BY id")
      .all(result.userId) as Array<{ claim: string }>;
    expect(claims.some(({ claim }) => claim.includes("Oakland"))).toBe(true);
    expect(claims.some(({ claim }) => claim.includes("Website building"))).toBe(true);
  });

  test("activates only through an explicitly configured existing circle", () => {
    const now = new Date().toISOString();
    db.query("INSERT INTO circles(id, name, status, created_at) VALUES ('trusted', 'Trusted', 'active', ?)")
      .run(now);
    const result = completeOnboarding(db, {
      name: "Jordan Helper", email: "jordan@example.test", phone: "+12025550901",
      role: "helper", community: "Oakland, CA", mode: "Both", availability: "Flexible",
      identity: "Name", skills: ["Planning"],
    }, { trustedCircleId: "trusted" });
    expect(result.approvalStatus).toBe("active");
    expect(db.query("SELECT 1 FROM circle_members WHERE circle_id = 'trusted' AND user_id = ? AND status = 'active'")
      .get(result.userId)).not.toBeNull();
  });

  test("requester consent never enables discovery before a real Gmail import", () => {
    const pending = completeOnboarding(db, {
      name: "Riley Requester", email: "riley@example.test", phone: "+12025550902",
      role: "requester", consent: true,
    });
    expect(pending.gmailStatus).toBe("connection-requested");
    expect(pending.bountyDiscoveryEnabled).toBe(false);
    expect((db.query("SELECT bounty_discovery_enabled FROM users WHERE id = ?").get(pending.userId) as {
      bounty_discovery_enabled: number;
    }).bounty_discovery_enabled).toBe(0);
  });

  test("enables requester discovery when the verified user already owns an active Gmail import", () => {
    const first = completeOnboarding(db, {
      name: "Riley Requester", email: "riley@example.test", phone: "+12025550902",
      role: "requester", consent: true,
    });
    const now = new Date().toISOString();
    db.query(`INSERT INTO mailboxes(id, user_id, email, source, status, consent_confirmed_at, created_at, updated_at)
      VALUES ('gmail:riley', ?, 'riley@example.test', 'gmail', 'active', ?, ?, ?)`
    ).run(first.userId, now, now, now);
    archiveEmail(db, { userId: first.userId, mailboxId: "gmail:riley" }, {
      providerMessageId: "gmail-riley-1", providerThreadId: "thread-riley-1",
      mailboxEmail: "riley@example.test", internalDateMs: Date.now(),
      sender: "Friend <friend@example.test>", recipients: ["Riley <riley@example.test>"],
      subject: "A small favor", normalizedBody: "Could use a hand moving a chair.",
    });
    const connected = completeOnboarding(db, {
      name: "Riley Requester", email: "riley@example.test", phone: "+12025550902",
      role: "requester", consent: true,
    });
    expect(connected.gmailStatus).toBe("connected");
    expect(connected.bountyDiscoveryEnabled).toBe(true);
  });
});
