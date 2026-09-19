import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import type {
  StructuredCompletionClient,
  StructuredCompletionRequest,
} from "../src/ai/openrouter.ts";
import { openDatabase } from "../src/db/index.ts";
import { seedMockMailboxes } from "../src/email/mock/seed.ts";
import { extractMemoriesFromEmail } from "../src/memory/extract.ts";
import { listActiveMemories } from "../src/memory/index.ts";
import { generateMemoryMarkdown, renderMemoryMarkdown } from "../src/memory/profile.ts";

class FakeStructuredClient implements StructuredCompletionClient {
  readonly model = "fake/structured-model";

  async complete<T>(request: StructuredCompletionRequest): Promise<T> {
    if (request.name === "email_memory_candidates") {
      if (!request.prompt.includes("mock:social-organizer:maya-dinner-2")) return { memories: [] } as T;
      return {
        memories: [
          {
            kind: "preference",
            claim: "Prefers somewhere quiet when catching up with Maya.",
            evidenceMessageIds: ["mock:social-organizer:maya-dinner-2"],
            eventAt: null,
          },
          {
            kind: "preference",
            claim: "Prefers Absinthe.",
            evidenceMessageIds: ["mock:social-organizer:maya-dinner-3"],
            eventAt: null,
          },
          {
            kind: "plan",
            claim: "Maya proposed Absinthe at 7:30 Friday; it is not booked.",
            evidenceMessageIds: [
              "mock:social-organizer:maya-dinner-3",
              "mock:social-organizer:maya-dinner-4",
            ],
            eventAt: null,
          },
        ],
      } as T;
    }

    const memories = listActiveMemories(db, "fixture:social-organizer");
    const quietPreference = memories.find((memory) => memory.claim.includes("somewhere quiet"));
    if (!quietPreference) throw new Error("Expected quiet preference fixture");
    return {
      overview: "A source-backed snapshot of current preferences and plans.",
      sections: [
        {
          title: "Preferences and plans",
          items: [
            { text: "Quiet settings are preferred for catching up with Maya.", memoryIds: [quietPreference.id] },
            { text: "This unsupported item should disappear.", memoryIds: [999_999] },
          ],
        },
      ],
    } as T;
  }
}

let db: Database;

beforeEach(async () => {
  db = await openDatabase({ path: ":memory:" });
  await seedMockMailboxes(db, new Date("2026-09-19T12:00:00Z"));
});

afterEach(() => db.close(false));

describe("model-backed memory generation", () => {
  test("extracts cited memories and rejects an incoming preference claim", async () => {
    const client = new FakeStructuredClient();
    const result = await extractMemoriesFromEmail(db, client, {
      userId: "fixture:social-organizer",
      mailboxId: "mock:social-organizer",
      mailbox: "casey.morgan@example.test",
      threadLimit: 20,
    });

    const memories = listActiveMemories(db, "fixture:social-organizer");
    expect(result.threadsRead).toBe(5);
    expect(memories.some((memory) => memory.claim.includes("somewhere quiet"))).toBe(true);
    expect(memories.some((memory) => memory.claim.includes("not booked"))).toBe(true);
    expect(memories.some((memory) => memory.claim === "Prefers Absinthe.")).toBe(false);
  });

  test("renders generated profile items only when they cite active memories", async () => {
    const client = new FakeStructuredClient();
    await extractMemoriesFromEmail(db, client, {
      userId: "fixture:social-organizer",
      mailboxId: "mock:social-organizer",
      mailbox: "casey.morgan@example.test",
      threadLimit: 20,
    });

    const markdown = await generateMemoryMarkdown(db, client, "fixture:social-organizer", "casey.morgan@example.test");
    expect(markdown).toContain("# DNM memory");
    expect(markdown).toContain("Quiet settings are preferred");
    expect(markdown).toContain("email:mock:social-organizer:maya-dinner-2");
    expect(markdown).not.toContain("unsupported item");
  });

  test("falls back to a local source-backed profile and stores it canonically", async () => {
    const client = new FakeStructuredClient();
    await extractMemoriesFromEmail(db, client, {
      userId: "fixture:social-organizer", mailboxId: "mock:social-organizer",
      mailbox: "casey.morgan@example.test", threadLimit: 20,
    });
    const markdown = renderMemoryMarkdown(
      db, "fixture:social-organizer", "casey.morgan@example.test", "failed/model",
    );
    expect(markdown).toContain("local profile formatting fallback");
    expect(markdown).toContain("Prefers somewhere quiet");
    const current = db.query(`SELECT model, profile_json FROM user_profiles
      WHERE user_id = ? AND is_current = 1`).get("fixture:social-organizer") as {
      model: string; profile_json: string;
    };
    expect(current.model).toContain("local profile formatting fallback");
    expect(current.profile_json).toContain("Prefers somewhere quiet");
  });
});
