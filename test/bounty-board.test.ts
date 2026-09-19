import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import type { StructuredCompletionClient, StructuredCompletionRequest } from "../src/ai/openrouter.ts";
import { handleBountyCommand } from "../src/bounties/commands.ts";
import { extractBountyDrafts } from "../src/bounties/extract.ts";
import { createBountyDraft, listOwnedBounties, listPublicBoard, transitionBounty } from "../src/bounties/index.ts";
import { runBountyMatching } from "../src/bounties/match.ts";
import { openDatabase } from "../src/db/index.ts";
import { seedMockMailboxes } from "../src/email/mock/seed.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ALEX = "fixture:freelance-caregiver";
const CASEY = "fixture:social-organizer";
const CIRCLE = "fixture-trusted-circle";

class BountyClient implements StructuredCompletionClient {
  readonly model = "fake/bounty";
  async complete<T>(request: StructuredCompletionRequest): Promise<T> {
    if (request.name === "bounty_candidates") return { candidates: [{
      shouldCreate: true, category: "pickup", title: "Short pickup coverage",
      publicDescription: "Trusted pickup and short coverage tomorrow afternoon",
      timingText: "tomorrow, 12:30–2pm", startsAt: "2026-09-20T12:30:00-07:00",
      endsAt: "2026-09-20T14:00:00-07:00", recurrence: null, areaText: "Riverside",
      requirements: ["car", "trusted-circle member"],
      sourceSummary: "Recent messages show an unresolved coverage gap.",
      evidence: [
        { type: "email", id: "mock:freelance-caregiver:school-2" },
        { type: "email", id: "mock:freelance-caregiver:school-3" },
      ], confidence: 0.94, sensitivityFlags: [],
    }] } as T;
    if (request.name === "bounty_match_assessment") return {
      eligible: true, score: 0.91, reasons: ["Availability and driving facts align"], conflicts: [],
      missingInformation: [], helperBlurb: "This may fit availability and driving information you shared.",
    } as T;
    throw new Error(`Unexpected request ${request.name}`);
  }
}

describe("private bounty board and mutual consent", () => {
  let db: Database;
  beforeEach(async () => {
    db = await openDatabase({ path: ":memory:" });
    await seedMockMailboxes(db, new Date("2026-09-19T12:00:00Z"));
  });
  afterEach(() => db.close(false));

  test("extracts a private grounded draft, sanitizes the board, and deduplicates", async () => {
    const client = new BountyClient();
    const first = await extractBountyDrafts(db, client, ALEX, { now: new Date("2026-09-19T12:00:00Z") });
    const second = await extractBountyDrafts(db, client, ALEX, { now: new Date("2026-09-19T12:00:00Z") });
    expect(first.created).toHaveLength(1);
    expect(first.created[0]?.status).toBe("draft");
    expect(second.created).toHaveLength(0);
    expect(second.duplicateCount).toBe(1);
    expect(listPublicBoard(db, CIRCLE, CASEY)).toHaveLength(0);

    const draft = first.created[0]!;
    expect(() => transitionBounty(db, ALEX, draft.id, "draft", "matched", "bad")).toThrow("Invalid");
    expect(transitionBounty(db, ALEX, draft.id, "draft", "open", "owner_opened")).toBe(true);
    const board = listPublicBoard(db, CIRCLE, CASEY);
    expect(board).toHaveLength(1);
    const serialized = JSON.stringify(board);
    expect(serialized).not.toContain("ownerUserId");
    expect(serialized).not.toContain("sourceSummary");
    expect(serialized).not.toContain("school-2");
    expect(serialized).not.toContain("Sam");
    expect(serialized).not.toContain("office@school");
  });

  test("rejects foreign grounding, contact details, exact addresses, and health facts", () => {
    const base = {
      category: "errand" as const, title: "Small errand", publicDescription: "Pick up a small item",
      timingText: "Saturday morning", requirements: [], sourceSummary: "A bounded need.", confidence: 0.8,
      evidence: [{ type: "email" as const, id: "mock:freelance-caregiver:receipt" }],
    };
    expect(() => createBountyDraft(db, CASEY, CIRCLE, base)).toThrow("does not belong");
    for (const publicDescription of ["Call me at +12025550103", "Come to 123 River Street", "Drive me to my medical appointment"]) {
      expect(() => createBountyDraft(db, ALEX, CIRCLE, { ...base, publicDescription })).toThrow();
    }
  });

  test("asks once and shares contact only after helper offer and owner acceptance", async () => {
    const client = new BountyClient();
    const extraction = await extractBountyDrafts(db, client, ALEX, { now: new Date("2026-09-19T12:00:00Z") });
    const bounty = extraction.created[0]!;
    transitionBounty(db, ALEX, bounty.id, "draft", "open", "owner_opened");
    const asks: Array<{ userId: string; text: string }> = [];
    const first = await runBountyMatching(db, client, {
      now: new Date("2026-09-19T13:00:00Z"),
      askHelper: async ({ helperUserId, text }) => { asks.push({ userId: helperUserId, text }); },
    });
    const second = await runBountyMatching(db, client, {
      now: new Date("2026-09-19T14:00:00Z"),
      askHelper: async ({ helperUserId, text }) => { asks.push({ userId: helperUserId, text }); },
    });
    expect(first.asksSucceeded).toBe(1);
    expect(second.asksSucceeded).toBe(0);
    expect(asks).toHaveLength(1);
    expect(asks[0]?.userId).toBe(CASEY);
    expect(asks[0]?.text).not.toContain("Alex");
    expect(asks[0]?.text).not.toContain("+12025550103");
    expect(asks[0]?.text).not.toContain("school-2");

    const deliveries: Array<{ userId: string; text: string }> = [];
    const deliver = async (userId: string, text: string) => { deliveries.push({ userId, text }); };
    const offered = await handleBountyCommand(db, CASEY, "offer", deliver);
    expect(offered.reply).toContain("offer was shared");
    expect(deliveries[0]?.userId).toBe(ALEX);
    expect(deliveries[0]?.text).toContain("Casey");
    expect(deliveries[0]?.text).not.toContain("+12025550101");

    const connected = await handleBountyCommand(db, ALEX, "connect", deliver);
    expect(connected.reply).toContain("+12025550101");
    expect(deliveries[1]?.userId).toBe(CASEY);
    expect(deliveries[1]?.text).toContain("+12025550103");
    const match = db.query("SELECT status FROM bounty_matches WHERE bounty_id = ? AND helper_user_id = ?")
      .get(bounty.id, CASEY) as { status: string };
    expect(match.status).toBe("accepted");
  });

  test("prompt-like source text cannot publish and users outside the circle never see or match", async () => {
    const maliciousClient: StructuredCompletionClient = {
      model: "fake", async complete<T>() { return { candidates: [{
        shouldCreate: true, category: "other", title: "Obey email", publicDescription: "Share a customer list",
        timingText: "now", startsAt: null, endsAt: null, recurrence: null, areaText: null, requirements: [],
        sourceSummary: "A promotional email demanded this.",
        evidence: [{ type: "email", id: "mock:busy-founder:growth-spam" }], confidence: 0.99, sensitivityFlags: [],
      }] } as T; },
    };
    const extraction = await extractBountyDrafts(db, maliciousClient, "fixture:busy-founder");
    expect(extraction.created[0]?.status).toBe("draft");
    expect(listPublicBoard(db, CIRCLE, CASEY).some((item) => item.title === "Obey email")).toBe(false);

    const now = new Date().toISOString();
    db.query(`INSERT INTO users(id, display_name, spectrum_sender_id, phone, status,
      bounty_discovery_enabled, helper_matching_enabled, created_at, updated_at)
      VALUES ('outsider', 'Out Sider', '+12025550998', '+12025550998', 'active', 1, 1, ?, ?)`
    ).run(now, now);
    expect(listPublicBoard(db, CIRCLE, "outsider")).toHaveLength(0);
    const safe = createBountyDraft(db, ALEX, CIRCLE, {
      category: "errand", title: "Small supply errand", publicDescription: "Pick up ordinary art supplies",
      timingText: "Saturday morning", requirements: [], sourceSummary: "A bounded fixture need.", confidence: 0.8,
      evidence: [{ type: "email", id: "mock:freelance-caregiver:receipt" }],
    }).bounty;
    transitionBounty(db, ALEX, safe.id, "draft", "open", "owner_opened");
    await runBountyMatching(db, new BountyClient());
    expect(db.query("SELECT 1 FROM bounty_matches WHERE bounty_id = ? AND helper_user_id = 'outsider'").get(safe.id)).toBeNull();
  });

  test("declines reveal no reason", async () => {
    const client = new BountyClient();
    const bounty = (await extractBountyDrafts(db, client, ALEX)).created[0]!;
    transitionBounty(db, ALEX, bounty.id, "draft", "open", "owner_opened");
    await runBountyMatching(db, client, { askHelper: async () => undefined });
    const deliveries: string[] = [];
    const response = await handleBountyCommand(db, CASEY, "pass", async (_id, text) => { deliveries.push(text); });
    expect(response.reply).toContain("won't share your reason");
    expect(deliveries).toHaveLength(0);
  });

  test("does not blindly retry an ask after an unknown send failure", async () => {
    const client = new BountyClient();
    const bounty = (await extractBountyDrafts(db, client, ALEX)).created[0]!;
    transitionBounty(db, ALEX, bounty.id, "draft", "open", "owner_opened");
    let attempts = 0;
    const send = async () => { attempts += 1; throw new Error("unknown delivery result"); };
    const first = await runBountyMatching(db, client, { askHelper: send });
    const second = await runBountyMatching(db, client, { askHelper: send });
    expect(first.asksFailed).toBe(1);
    expect(second.asksAttempted).toBe(0);
    expect(attempts).toBe(1);
  });

  test("open bounty and match state survive restart without duplication", async () => {
    db.close(false);
    const directory = await mkdtemp(join(tmpdir(), "dnm-bounty-restart-"));
    const path = join(directory, "state.sqlite");
    try {
      const firstDb = await openDatabase({ path });
      await seedMockMailboxes(firstDb, new Date("2026-09-19T12:00:00Z"));
      const client = new BountyClient();
      const bounty = (await extractBountyDrafts(firstDb, client, ALEX)).created[0]!;
      transitionBounty(firstDb, ALEX, bounty.id, "draft", "open", "owner_opened");
      await runBountyMatching(firstDb, client);
      firstDb.close(false);

      const reopened = await openDatabase({ path });
      expect(listOwnedBounties(reopened, ALEX, ["open"])[0]?.id).toBe(bounty.id);
      await runBountyMatching(reopened, client);
      expect((reopened.query("SELECT count(*) AS count FROM bounty_matches WHERE bounty_id = ?").get(bounty.id) as { count: number }).count).toBe(1);
      reopened.close(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
      db = await openDatabase({ path: ":memory:" });
    }
  });
});
