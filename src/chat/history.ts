import type { Database } from "bun:sqlite";

export interface ChatMessageInput {
  userId: string;
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
      user_id, provider_message_id, conversation_id, sender_id, direction, content,
      occurred_at, processing_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    message.userId,
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
  userId: string,
  providerMessageId: string,
  status: "processing" | "processed" | "failed",
  errorCode?: string,
): void {
  db.query(`
    UPDATE chat_messages SET processing_status = ?, error_code = ?
    WHERE user_id = ? AND provider_message_id = ?
  `).run(status, errorCode ?? null, userId, providerMessageId);
}

export function recentChatHistory(db: Database, userId: string, conversationId: string, limit = 20): Array<{
  direction: "inbound" | "outbound";
  content: string;
  occurredAt: string;
}> {
  const rows = db.query(`
    SELECT direction, content, occurred_at FROM (
      SELECT id, direction, content, occurred_at
      FROM chat_messages
      WHERE user_id = ? AND conversation_id = ? AND processing_status IN ('processed', 'processing')
      ORDER BY occurred_at DESC, id DESC
      LIMIT ?
    ) ORDER BY occurred_at, id
  `).all(userId, conversationId, Math.max(1, Math.min(100, Math.trunc(limit)))) as Array<{
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

export function recentUserMessages(
  db: Database,
  userId: string,
  conversationId: string,
  limit = 3,
): Array<{ content: string; occurredAt: string }> {
  const rows = db.query(`
    SELECT content, occurred_at FROM (
      SELECT id, content, occurred_at
      FROM chat_messages
      WHERE user_id = ? AND conversation_id = ?
        AND direction = 'inbound'
        AND processing_status IN ('processed', 'processing')
      ORDER BY occurred_at DESC, id DESC
      LIMIT ?
    ) ORDER BY occurred_at, id
  `).all(userId, conversationId, Math.max(1, Math.min(20, Math.trunc(limit)))) as Array<{
    content: string;
    occurred_at: string;
  }>;

  return rows.map((row) => ({
    content: row.content,
    occurredAt: row.occurred_at,
  }));
}
