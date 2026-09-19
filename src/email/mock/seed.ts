import type { Database } from "bun:sqlite";
import { syncMailConnector } from "../sync-connector.ts";
import { MockMailConnector } from "./connector.ts";
import { personas } from "./personas.ts";
import { recordChatMessage } from "../../chat/history.ts";
import { createMemory } from "../../memory/index.ts";

export interface SeededMailbox {
  personaId: string;
  email: string;
  phone: string;
  messages: number;
}

export async function seedMockMailboxes(db: Database, anchor = new Date()): Promise<SeededMailbox[]> {
  const realMailboxes = (db.query("SELECT count(*) AS count FROM mailboxes WHERE source = 'gmail'").get() as { count: number }).count;
  if (realMailboxes > 0) throw new Error("Refusing to mix fixture and Gmail users; use a separate database for fixture mode");
  const results: SeededMailbox[] = [];
  const upsertMailbox = db.query(`
    INSERT INTO mock_mailboxes(id, user_id, persona_id, owner_name, email, phone, description, seeded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(persona_id) DO UPDATE SET
      user_id = excluded.user_id,
      owner_name = excluded.owner_name,
      email = excluded.email,
      phone = excluded.phone,
      description = excluded.description,
      seeded_at = excluded.seeded_at
  `);

  for (const persona of personas) {
    const now = anchor.toISOString();
    const userId = `fixture:${persona.id}`;
    const mailboxId = `mock:${persona.id}`;
    db.query(`
      INSERT INTO users(
        id, display_name, spectrum_sender_id, phone, status,
        bounty_discovery_enabled, helper_matching_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'active', 1, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name,
        spectrum_sender_id = excluded.spectrum_sender_id, phone = excluded.phone,
        updated_at = excluded.updated_at
    `).run(userId, persona.name, persona.phone, persona.phone, now, now);
    db.query(`
      INSERT INTO mailboxes(
        id, user_id, email, source, status, consent_confirmed_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'mock', 'active', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, email = excluded.email,
        status = 'active', updated_at = excluded.updated_at
    `).run(mailboxId, userId, persona.email, now, now, now);
    const connector = new MockMailConnector(persona.id, anchor);
    const result = await syncMailConnector(db, { userId, mailboxId }, connector);
    upsertMailbox.run(
      mailboxId,
      userId,
      persona.id,
      persona.name,
      persona.email,
      persona.phone,
      persona.description,
      anchor.toISOString(),
    );
    results.push({
      personaId: persona.id,
      email: result.mailboxEmail,
      phone: persona.phone,
      messages: result.importedCount,
    });
  }

  const now = anchor.toISOString();
  db.query(`INSERT INTO settings(key, value_json, updated_at) VALUES ('demo_mode', '"fixture"', ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`).run(now);
  db.query(`
    INSERT INTO circles(id, name, status, created_at) VALUES ('fixture-trusted-circle', 'Fixture trusted circle', 'active', ?)
    ON CONFLICT(id) DO UPDATE SET status = 'active'
  `).run(now);
  for (const persona of personas) {
    db.query(`
      INSERT INTO circle_members(circle_id, user_id, status, joined_at)
      VALUES ('fixture-trusted-circle', ?, 'active', ?)
      ON CONFLICT(circle_id, user_id) DO UPDATE SET status = 'active'
    `).run(`fixture:${persona.id}`, now);
  }

  const caseyId = "fixture:social-organizer";
  const helperMessageId = "fixture:casey:helper-availability";
  recordChatMessage(db, {
    userId: caseyId,
    providerMessageId: helperMessageId,
    conversationId: "fixture:casey",
    senderId: personas[0]!.phone,
    direction: "inbound",
    content: "I live near Riverside, have a car, and am free tomorrow from 12:30 to 2pm to help friends.",
    occurredAt: now,
    processingStatus: "processed",
  });
  createMemory(db, caseyId, {
    kind: "preference",
    claim: "Casey is near Riverside, has a car, and is available tomorrow from 12:30pm to 2pm to help friends.",
    origin: "user-stated",
    evidence: [{ type: "chat", id: helperMessageId }],
  });
  return results;
}
