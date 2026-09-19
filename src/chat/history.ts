import type { Database } from "bun:sqlite";

export interface ChatMessageInput {
  providerMessageId: string;
  conversationId: string;
  senderId: string;
  direction: "inbound" | "outbound";
  content: string;
  occurredAt?: string;
  processingStatus?: "pending" | "processing" | "processed" | "failed";
}

export function recordChatMessage(db: Database, message: ChatMessageInput): boolean {
  const result = db.query(`
    INSERT OR IGNORE INTO chat_messages(
      provider_message_id, conversation_id, sender_id, direction, content,
      occurred_at, processing_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    message.providerMessageId,
    message.conversationId,
    message.senderId,
    message.direction,
    message.content,
    message.occurredAt ?? new Date().toISOString(),
    message.processingStatus ?? "pending",
  );
  return result.changes === 1;
}

export function updateProcessingStatus(
  db: Database,
  providerMessageId: string,
  status: "processing" | "processed" | "failed",
  errorCode?: string,
): void {
  db.query(`
    UPDATE chat_messages SET processing_status = ?, error_code = ?
    WHERE provider_message_id = ?
  `).run(status, errorCode ?? null, providerMessageId);
}

export function recentChatHistory(db: Database, conversationId: string, limit = 20): Array<{
  direction: "inbound" | "outbound";
  content: string;
  occurredAt: string;
}> {
  const rows = db.query(`
    SELECT direction, content, occurred_at FROM (
      SELECT id, direction, content, occurred_at
      FROM chat_messages
      WHERE conversation_id = ? AND processing_status IN ('processed', 'processing')
      ORDER BY occurred_at DESC, id DESC
      LIMIT ?
    ) ORDER BY occurred_at, id
  `).all(conversationId, Math.max(1, Math.min(100, Math.trunc(limit)))) as Array<{
    direction: "inbound" | "outbound";
    content: string;
    occurred_at: string;
  }>;
  return rows.map((row) => ({
    direction: row.direction,
    content: row.content,
    occurredAt: row.occurred_at,
  }));
}
