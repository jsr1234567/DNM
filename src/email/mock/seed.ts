import type { Database } from "bun:sqlite";
import { syncMailConnector } from "../sync-connector.ts";
import { MockMailConnector } from "./connector.ts";
import { personas } from "./personas.ts";

export interface SeededMailbox {
  personaId: string;
  email: string;
  phone: string;
  messages: number;
}

export async function seedMockMailboxes(db: Database, anchor = new Date()): Promise<SeededMailbox[]> {
  const results: SeededMailbox[] = [];
  const upsertMailbox = db.query(`
    INSERT INTO mock_mailboxes(id, persona_id, owner_name, email, phone, description, seeded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(persona_id) DO UPDATE SET
      owner_name = excluded.owner_name,
      email = excluded.email,
      phone = excluded.phone,
      description = excluded.description,
      seeded_at = excluded.seeded_at
  `);

  for (const persona of personas) {
    const connector = new MockMailConnector(persona.id, anchor);
    const result = await syncMailConnector(db, connector);
    upsertMailbox.run(
      `mock:${persona.id}`,
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
  return results;
}
