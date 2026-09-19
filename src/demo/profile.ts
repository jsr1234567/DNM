import type { Database } from "bun:sqlite";
import { join } from "node:path";
import { dataDir } from "../config.ts";

export interface DemoProfileBinding {
  senderId: string;
  email: string;
  personaId?: string;
  name?: string;
  description?: string;
}

export interface DemoProfile {
  userId: string;
  senderId: string;
  name: string;
  email: string;
  description: string;
  sourceMailboxEmail: string;
}

export function resolveDemoProfile(db: Database, binding: DemoProfileBinding): DemoProfile {
  const senderId = binding.senderId.trim();
  const email = binding.email.trim().toLowerCase();
  const personaId = binding.personaId?.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(senderId) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("The local demo profile binding is invalid");
  }
  let userId: string;
  let name = binding.name?.trim();
  let description = binding.description?.trim();
  let sourceMailboxEmail = email;
  if (personaId) {
    const mailbox = db.query(`
      SELECT user_id, owner_name, email, description
      FROM mock_mailboxes WHERE persona_id = ?
    `).get(personaId) as {
      user_id: string; owner_name: string; email: string; description: string;
    } | null;
    if (!mailbox) throw new Error(`Mock persona not found: ${personaId}`);
    userId = mailbox.user_id;
    name ||= mailbox.owner_name;
    description ||= mailbox.description;
    sourceMailboxEmail = mailbox.email;
  } else {
    const mailbox = db.query(`
      SELECT m.user_id, m.email, u.display_name
      FROM mailboxes m JOIN users u ON u.id = m.user_id
      WHERE lower(m.email) = lower(?) AND m.source = 'gmail' AND m.status = 'active'
    `).get(email) as { user_id: string; email: string; display_name: string } | null;
    if (!mailbox) throw new Error(`No active imported Gmail mailbox found for ${email}`);
    const message = db.query("SELECT 1 FROM email_messages WHERE user_id = ? AND mailbox_id IN (SELECT id FROM mailboxes WHERE user_id = ? AND lower(email) = lower(?)) LIMIT 1")
      .get(mailbox.user_id, mailbox.user_id, email);
    if (!message) throw new Error(`No imported email found for ${email}`);
    userId = mailbox.user_id;
    name ||= mailbox.display_name;
    description ||= "Consenting Gmail account mirrored into the local demo database.";
    sourceMailboxEmail = mailbox.email;
  }
  return {
    userId,
    senderId,
    name: name || email.split("@")[0]!,
    email,
    description: description || "Local demo profile.",
    sourceMailboxEmail,
  };
}

export function bindDemoProfile(db: Database, binding: DemoProfileBinding): DemoProfile {
  const profile = resolveDemoProfile(db, binding);
  const conflict = db.query(`SELECT id FROM users WHERE spectrum_sender_id = ? AND id <> ?`)
    .get(profile.senderId, profile.userId) as { id: string } | null;
  if (conflict) throw new Error("Demo sender is already assigned to another local user");
  const now = new Date().toISOString();
  db.query(`
    INSERT INTO demo_profile_bindings(user_id, sender_id, email, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET sender_id = excluded.sender_id,
      email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at
  `).run(profile.userId, profile.senderId, profile.email, profile.name, now, now);
  return profile;
}

export async function loadDemoProfile(
  db: Database,
  path = join(dataDir, "demo-profile.json"),
): Promise<DemoProfile | undefined> {
  const file = Bun.file(path);
  if (!(await file.exists())) return undefined;
  return bindDemoProfile(db, await file.json() as DemoProfileBinding);
}
