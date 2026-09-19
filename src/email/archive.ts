import type { Database } from "bun:sqlite";

export const EMAIL_INDEX_VERSION = "email-v1";

export interface ArchivedEmail {
  providerMessageId: string;
  providerThreadId: string;
  mailboxEmail: string;
  rfcMessageId?: string;
  sentAt?: string;
  internalDateMs: number;
  sender: string;
  recipients: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  normalizedBody: string;
  snippet?: string;
  labels?: string[];
}

export interface ArchiveResult {
  messageId: number;
  chunkCount: number;
}

export function chunkText(text: string, maxChars = 1_200, overlapChars = 150): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) return [];
  if (maxChars < 200 || overlapChars < 0 || overlapChars >= maxChars) {
    throw new Error("Invalid chunk sizing");
  }

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + maxChars, normalized.length);
    if (end < normalized.length) {
      const paragraphBreak = normalized.lastIndexOf("\n\n", end);
      const sentenceBreak = Math.max(
        normalized.lastIndexOf(". ", end),
        normalized.lastIndexOf("? ", end),
        normalized.lastIndexOf("! ", end),
      );
      const candidate = Math.max(paragraphBreak, sentenceBreak >= 0 ? sentenceBreak + 1 : -1);
      if (candidate > start + Math.floor(maxChars * 0.55)) end = candidate;
    }
    chunks.push(normalized.slice(start, end).trim());
    if (end === normalized.length) break;
    start = Math.max(start + 1, end - overlapChars);
  }
  return chunks.filter(Boolean);
}

export function archiveEmail(db: Database, email: ArchivedEmail): ArchiveResult {
  if (!email.providerMessageId || !email.providerThreadId || !email.mailboxEmail) {
    throw new Error("Email provider IDs and mailbox are required");
  }
  const now = new Date().toISOString();
  const chunks = chunkText(email.normalizedBody || email.snippet || email.subject);

  return db.transaction(() => {
    db.query(`
      INSERT INTO email_messages(
        provider_message_id, provider_thread_id, mailbox_email, rfc_message_id,
        sent_at, internal_date_ms, sender, recipients_json, cc_json, bcc_json,
        subject, normalized_body, snippet, labels_json, imported_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_message_id) DO UPDATE SET
        provider_thread_id = excluded.provider_thread_id,
        mailbox_email = excluded.mailbox_email,
        rfc_message_id = excluded.rfc_message_id,
        sent_at = excluded.sent_at,
        internal_date_ms = excluded.internal_date_ms,
        sender = excluded.sender,
        recipients_json = excluded.recipients_json,
        cc_json = excluded.cc_json,
        bcc_json = excluded.bcc_json,
        subject = excluded.subject,
        normalized_body = excluded.normalized_body,
        snippet = excluded.snippet,
        labels_json = excluded.labels_json,
        updated_at = excluded.updated_at
    `).run(
      email.providerMessageId,
      email.providerThreadId,
      email.mailboxEmail.toLowerCase(),
      email.rfcMessageId ?? null,
      email.sentAt ?? null,
      email.internalDateMs,
      email.sender,
      JSON.stringify(email.recipients),
      JSON.stringify(email.cc ?? []),
      JSON.stringify(email.bcc ?? []),
      email.subject,
      email.normalizedBody,
      email.snippet ?? "",
      JSON.stringify(email.labels ?? []),
      now,
      now,
    );

    const row = db.query(
      "SELECT id FROM email_messages WHERE provider_message_id = ?",
    ).get(email.providerMessageId) as { id: number };

    const oldChunkIds = db.query("SELECT id FROM chunks WHERE email_message_id = ?").all(row.id) as Array<{
      id: number;
    }>;
    for (const chunk of oldChunkIds) {
      db.query("DELETE FROM chunks_fts WHERE chunk_id = ?").run(chunk.id);
    }
    db.query("DELETE FROM chunks WHERE email_message_id = ?").run(row.id);

    const participants = [email.sender, ...email.recipients, ...(email.cc ?? []), ...(email.bcc ?? [])]
      .join(" ");
    const insertChunk = db.query(`
      INSERT INTO chunks(email_message_id, chunk_index, text, index_version, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertFts = db.query(`
      INSERT INTO chunks_fts(chunk_id, text, subject, participants) VALUES (?, ?, ?, ?)
    `);
    chunks.forEach((text, index) => {
      const result = insertChunk.run(row.id, index, text, EMAIL_INDEX_VERSION, now);
      insertFts.run(Number(result.lastInsertRowid), text, email.subject, participants);
    });

    return { messageId: row.id, chunkCount: chunks.length };
  })();
}

export function rebuildEmailFts(db: Database): number {
  return db.transaction(() => {
    db.exec("DELETE FROM chunks_fts");
    db.exec(`
      INSERT INTO chunks_fts(chunk_id, text, subject, participants)
      SELECT c.id, c.text, e.subject,
        e.sender || ' ' || e.recipients_json || ' ' || e.cc_json || ' ' || e.bcc_json
      FROM chunks c
      JOIN email_messages e ON e.id = c.email_message_id
    `);
    return (db.query("SELECT count(*) AS count FROM chunks_fts").get() as { count: number }).count;
  })();
}
