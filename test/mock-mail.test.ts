import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { openDatabase } from "../src/db/index.ts";
import { searchEmail } from "../src/email/search.ts";
import { MockMailConnector } from "../src/email/mock/connector.ts";
import { personas } from "../src/email/mock/personas.ts";
import { seedMockMailboxes } from "../src/email/mock/seed.ts";

let db: Database;

beforeEach(async () => {
  db = await openDatabase({ path: ":memory:" });
});

afterEach(() => db.close(false));

describe("mock mail connector", () => {
  test("paginates messages and exposes a stable change cursor", async () => {
    const connector = new MockMailConnector("social-organizer", new Date("2026-09-19T12:00:00Z"));
    const first = await connector.listMessages({ pageSize: 3 });
    const second = await connector.listMessages({ pageSize: 3, pageToken: first.nextPageToken });

    expect(first.messages).toHaveLength(3);
    expect(second.messages).toHaveLength(3);
    expect(new Set([...first.messages, ...second.messages].map((message) => message.providerMessageId)).size).toBe(6);

    const changes = await connector.listChanges("2");
    expect(changes.changes).toHaveLength(connector.messages.length - 2);
    expect(changes.cursor).toBe(String(connector.messages.length));
    expect(await connector.getMessage(first.messages[0]!.providerMessageId)).toEqual(first.messages[0]);
  });

  test("seeds every persona through the archive and is idempotent", async () => {
    const expectedMessages = personas.reduce((sum, persona) => sum + persona.messages.length, 0);
    const anchor = new Date("2026-09-19T12:00:00Z");

    const first = await seedMockMailboxes(db, anchor);
    const second = await seedMockMailboxes(db, anchor);

    expect(first).toHaveLength(personas.length);
    expect(second).toEqual(first);
    expect((db.query("SELECT count(*) AS count FROM mock_mailboxes").get() as { count: number }).count).toBe(personas.length);
    expect((db.query("SELECT count(*) AS count FROM email_messages").get() as { count: number }).count).toBe(expectedMessages);
    expect(searchEmail(db, "security summary")[0]?.sender).toContain("Ana Ruiz");
    expect(searchEmail(db, "quiet").some((result) => result.sender.includes("Casey Morgan"))).toBe(true);
  });
});
