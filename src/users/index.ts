import type { Database } from "bun:sqlite";

export interface UserRecord {
  id: string;
  displayName: string;
  spectrumSenderId: string;
  phone?: string;
  status: "active" | "paused";
  bountyDiscoveryEnabled: boolean;
  helperMatchingEnabled: boolean;
  profileEmail?: string;
}

type UserRow = {
  id: string;
  display_name: string;
  spectrum_sender_id: string;
  phone: string | null;
  status: "active" | "paused";
  bounty_discovery_enabled: number;
  helper_matching_enabled: number;
  binding_sender_id: string | null;
  binding_email: string | null;
};

function fromRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    spectrumSenderId: row.binding_sender_id ?? row.spectrum_sender_id,
    phone: row.binding_sender_id ?? row.phone ?? undefined,
    status: row.status,
    bountyDiscoveryEnabled: row.bounty_discovery_enabled === 1,
    helperMatchingEnabled: row.helper_matching_enabled === 1,
    profileEmail: row.binding_email ?? undefined,
  };
}

export function resolveUserBySender(db: Database, senderId: string): UserRecord | undefined {
  const row = db.query(`
    SELECT u.id, coalesce(d.display_name, u.display_name) AS display_name,
      u.spectrum_sender_id, u.phone, u.status, u.bounty_discovery_enabled,
      u.helper_matching_enabled, d.sender_id AS binding_sender_id, d.email AS binding_email
    FROM users u LEFT JOIN demo_profile_bindings d ON d.user_id = u.id
    WHERE (d.sender_id = ? OR (d.sender_id IS NULL AND u.spectrum_sender_id = ?))
      AND u.status = 'active'
  `).get(senderId, senderId) as UserRow | null;
  return row ? fromRow(row) : undefined;
}

export function resolveInboundUser(db: Database, event: {
  direction: string;
  contentType: string;
  platform: string;
  spaceType: string;
  senderId?: string;
}): UserRecord | undefined {
  if (event.direction !== "inbound" || event.contentType !== "text" ||
      event.platform !== "imessage" || event.spaceType !== "dm" || !event.senderId) return undefined;
  return resolveUserBySender(db, event.senderId);
}

export function getUser(db: Database, userId: string): UserRecord | undefined {
  const row = db.query(`
    SELECT u.id, coalesce(d.display_name, u.display_name) AS display_name,
      u.spectrum_sender_id, u.phone, u.status, u.bounty_discovery_enabled,
      u.helper_matching_enabled, d.sender_id AS binding_sender_id, d.email AS binding_email
    FROM users u LEFT JOIN demo_profile_bindings d ON d.user_id = u.id WHERE u.id = ?
  `).get(userId) as UserRow | null;
  return row ? fromRow(row) : undefined;
}

export function setUserConsent(
  db: Database,
  userId: string,
  field: "bounty_discovery_enabled" | "helper_matching_enabled",
  enabled: boolean,
): boolean {
  const result = db.query(`UPDATE users SET ${field} = ?, updated_at = ? WHERE id = ?`).run(
    enabled ? 1 : 0,
    new Date().toISOString(),
    userId,
  );
  return result.changes === 1;
}

export function requireOwnedMailbox(
  db: Database,
  userId: string,
  mailboxId: string,
): { id: string; email: string; source: "gmail" | "mock" } {
  const row = db.query(`
    SELECT id, email, source FROM mailboxes
    WHERE id = ? AND user_id = ? AND status = 'active'
  `).get(mailboxId, userId) as { id: string; email: string; source: "gmail" | "mock" } | null;
  if (!row) throw new Error("Active mailbox does not belong to this user");
  return row;
}
